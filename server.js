// Minimal local server (no dependencies). localhost is a "secure context",
// so the browser allows microphone access.
// Karaoke mode API:
//   GET /api/nowplaying  -> song playing on Spotify or Music (title, position...)
//   GET /api/recognize   -> recognizes the song from the microphone with ShazamKit
// (synced lyrics are fetched by the page itself, see app/js/lyrics.js)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, 'app');
const PORT = +process.env.PORT || 8765;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const run = (cmd, args, timeout = 5000) => new Promise(resolve => {
  execFile(cmd, args, { timeout }, (err, stdout) => resolve(err ? null : stdout.trim()));
});

// --- now playing (AppleScript) -------------------------------------------------
const PLAYERS = {
  Spotify: `tell application "Spotify"
    if player state is stopped then return ""
    set t to current track
    return (name of t) & "\n" & (artist of t) & "\n" & (album of t) & "\n" & ((duration of t) / 1000) & "\n" & player position & "\n" & (player state as string)
  end tell`,
  Music: `tell application "Music"
    if player state is stopped then return ""
    set t to current track
    return (name of t) & "\n" & (artist of t) & "\n" & (album of t) & "\n" & (duration of t) & "\n" & player position & "\n" & (player state as string)
  end tell`,
};
const num = s => parseFloat(String(s).replace(',', '.'));   // AppleScript uses a decimal comma in some locales

async function nowPlaying() {
  let paused = null;
  for (const [app, script] of Object.entries(PLAYERS)) {
    // don't launch the player if it's closed
    const running = await run('osascript', ['-e', `application "${app}" is running`]);
    if (running !== 'true') continue;
    const t0 = Date.now() / 1000;
    const out = await run('osascript', ['-e', script]);
    // the position is read near the end of the ~130 ms script: timestamp it there, not after
    const at = Date.now() / 1000 - 0.25 * (Date.now() / 1000 - t0);
    if (!out) continue;
    const [title, artist, album, duration, position, state] = out.split('\n');
    const info = { source: app, title, artist, album, duration: num(duration), position: num(position),
      playing: state === 'playing', at };
    if (info.playing) return info;
    paused = paused || info;
  }
  return paused || { source: null };
}

// --- ShazamKit recognition --------------------------------------------------------
const RECOGNIZER = path.join(__dirname, 'scripts', 'recognize');
let recognizing = null;
async function recognize() {
  if (recognizing) return recognizing;
  recognizing = (async () => {
    if (!fs.existsSync(RECOGNIZER)) {
      const ok = await run('swiftc', ['-O', RECOGNIZER + '.swift', '-o', RECOGNIZER], 300000);
      if (ok === null) return { ok: false, error: 'failed to compile the recognizer' };
    }
    const out = await run(RECOGNIZER, ['12'], 20000);
    try { return JSON.parse(out); } catch { return { ok: false, error: 'recognizer not available' }; }
  })();
  try { return await recognizing; } finally { recognizing = null; }
}

// --- HTTP ----------------------------------------------------------------------------
const API = {
  '/api/nowplaying': nowPlaying,
  '/api/recognize': recognize,
};

http.createServer(async (req, res) => {
  const [rawPath, query = ''] = req.url.split('?');
  const url = decodeURIComponent(rawPath);
  if (API[url]) {
    const data = await API[url](Object.fromEntries(new URLSearchParams(query))).catch(e => ({ error: e.message }));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    return res.end(JSON.stringify(data));
  }
  const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`Caleido running at http://localhost:${PORT}`));
