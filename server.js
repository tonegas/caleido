// Minimal local server (no dependencies). localhost is a "secure context",
// so the browser allows microphone access.
// Karaoke mode API:
//   GET /api/nowplaying  -> song playing on Spotify or Music (title, position...)
//   GET /api/recognize   -> recognizes the song from the microphone with ShazamKit
//   GET /api/lyrics?title=&artist=&album=&duration= -> synced lyrics from LRCLIB
const http = require('http');
const https = require('https');
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
    const out = await run('osascript', ['-e', script]);
    if (!out) continue;
    const [title, artist, album, duration, position, state] = out.split('\n');
    const info = { source: app, title, artist, album, duration: num(duration), position: num(position),
      playing: state === 'playing', at: Date.now() / 1000 };
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

// --- synced lyrics (LRCLIB) ------------------------------------------------------
const lyricsCache = new Map();

function getJSON(url) {
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'Caleido (party visualizer)' }, timeout: 8000 }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(res.statusCode === 200 ? JSON.parse(body) : null); } catch { resolve(null); } });
    }).on('error', () => resolve(null)).on('timeout', function () { this.destroy(); });
  });
}

// "Song - Remastered 2011", "Song (feat. X)" -> "Song"
const cleanTitle = t => t.replace(/\s+-\s+.*$/, '').replace(/\s*[([](feat|ft|with|remaster|live|radio|version|edit)[^)\]]*[)\]]/gi, '').trim();
const cleanArtist = a => a.split(/,|&| feat\.? | ft\.? /i)[0].trim();

function parseLRC(lrc) {
  const lines = [];
  for (const row of lrc.split('\n')) {
    const tags = [...row.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const text = row.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of tags) lines.push({ t: +m[1] * 60 + +m[2], text });
  }
  return lines.sort((a, b) => a.t - b.t);
}

async function lyrics({ title = '', artist = '', album = '', duration = '' }) {
  const key = `${title}|${artist}`.toLowerCase();
  if (lyricsCache.has(key)) return lyricsCache.get(key);
  const q = new URLSearchParams({ track_name: cleanTitle(title), artist_name: cleanArtist(artist) });
  let best = null;
  if (duration) {
    const exact = await getJSON(`https://lrclib.net/api/get?${q}&album_name=${encodeURIComponent(album)}&duration=${Math.round(duration)}`);
    if (exact?.syncedLyrics) best = exact;
  }
  if (!best) {
    // increasingly tolerant searches: title+artist, free text, title only
    let list = (await getJSON(`https://lrclib.net/api/search?${q}`)) || [];
    if (!list.length) list = (await getJSON(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle(title) + ' ' + cleanArtist(artist))}`)) || [];
    if (!list.length) {
      const art = cleanArtist(artist).toLowerCase().split(/\s+/);
      list = ((await getJSON(`https://lrclib.net/api/search?track_name=${encodeURIComponent(cleanTitle(title))}`)) || [])
        .filter(r => art.some(w => w.length > 2 && r.artistName.toLowerCase().includes(w)));
    }
    const dur = +duration || 0;
    const score = r => (r.syncedLyrics ? 0 : 1000) + (dur ? Math.abs(r.duration - dur) : 0);
    best = list.sort((a, b) => score(a) - score(b))[0] || null;
  }
  const result = best
    ? { found: true, title: best.trackName, artist: best.artistName,
        synced: best.syncedLyrics ? parseLRC(best.syncedLyrics) : null, plain: best.plainLyrics || null }
    : { found: false };
  if (best || lyricsCache.size < 500) lyricsCache.set(key, result);
  return result;
}

// --- HTTP ----------------------------------------------------------------------------
const API = {
  '/api/nowplaying': nowPlaying,
  '/api/recognize': recognize,
  '/api/lyrics': lyrics,
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
