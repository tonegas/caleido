// End-to-end test: headless Chrome with a fake microphone that "hears" test/beat120.wav.
// Checks that shaders compile, audio is analyzed, beats are ~120 BPM, every scene
// and Milkdrop mode draw non-black frames, and karaoke lines are timed. Screenshots go to test/shots.
import puppeteer from 'puppeteer-core';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');
const shots = path.join(dir, 'shots');
fs.mkdirSync(shots, { recursive: true });
const PORT = 8799;
const wav = process.argv[2] || path.join(dir, 'beat120.wav');
if (!fs.existsSync(wav)) spawnSync('node', [path.join(dir, 'gen-wav.js'), wav, '60']);   // 120 BPM test track

const server = spawn('node', [path.join(root, 'server.js')], { env: { ...process.env, PORT } });
await new Promise(r => server.stdout.once('data', r));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: [
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-swiftshader', '--window-size=1280,720',
    '--disable-features=AudioServiceSandbox', // otherwise Chrome can't read the fake audio file
  ],
});
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) failures++; };

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/?auto=0&hud=1`);
  await new Promise(r => setTimeout(r, 8000));

  const st = await page.evaluate(() => {
    const { audio, state } = window.__party;
    return { running: state.running, beats: audio.beatCount, bpm: audio.bpm, fps: state.fps,
      specMax: Math.max(...audio.spectrum), label: audio.label() };
  });
  console.log('state:', st);
  check(errors.length === 0, `no JS errors ${errors.join(' | ')}`);
  check(st.running, 'microphone active');
  check(st.specMax > 100, 'spectrum has signal');
  check(st.beats >= 8, `beats detected (${st.beats} in ~8s)`);
  check(Math.abs(st.bpm - 120) <= 6, `estimated tempo ${st.bpm} BPM (expected 120)`);

  // average brightness of the visible canvas
  const brightness = () => page.evaluate(() => {
    const c = document.querySelector('canvas:not([hidden])');
    window.__party.md?.render(); // butterchurn doesn't preserve the buffer: redraw in the same task
    const t = document.createElement('canvas'); t.width = 64; t.height = 36;
    const g = t.getContext('2d'); g.drawImage(c, 0, 0, 64, 36);
    const d = g.getImageData(0, 0, 64, 36).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
    return s / (d.length / 4) / 3;
  });

  for (let i = 0; i < 6; i++) {
    await page.keyboard.press(String(i + 1));
    await new Promise(r => setTimeout(r, 2500));
    const b = await brightness();
    const name = await page.evaluate(() => window.__party.state.scene);
    await page.screenshot({ path: path.join(shots, `scene${i}.png`) });
    check(name === i && b > 8, `scene ${i + 1} draws (average brightness ${b.toFixed(1)})`);
  }

  await page.keyboard.press('m');
  await new Promise(r => setTimeout(r, 4000));
  // some presets are dark by nature: try up to 3
  let mb = await brightness();
  for (let i = 0; i < 2 && mb <= 8; i++) {
    await page.keyboard.press('n');
    await new Promise(r => setTimeout(r, 4000));
    mb = await brightness();
  }
  const mode = await page.evaluate(() => [window.__party.state.mode, window.__party.state.presetName]);
  await page.screenshot({ path: path.join(shots, 'milkdrop.png') });
  check(mode[0] === 'milkdrop' && mb > 8, `Milkdrop "${mode[1]}" draws (brightness ${mb.toFixed(1)})`);
  check(errors.length === 0, `no JS errors after scene changes ${errors.join(' | ')}`);

  // --- karaoke: simulated player and lyrics (made-up lines, one every 2 s) ---
  await page.keyboard.press('m');
  const t0 = Date.now() / 1000;
  const fake = Array.from({ length: 20 }, (_, i) => ({ t: i * 2, text: `Test line number ${i}` }));
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = r.url();
    if (u.includes('/api/nowplaying')) return r.respond({ contentType: 'application/json', body: JSON.stringify(
      { source: 'Spotify', title: 'Test song', artist: 'Test', album: '', duration: 40, position: Date.now() / 1000 - t0, playing: true, at: Date.now() / 1000 }) });
    if (u.includes('/api/lyrics')) return r.respond({ contentType: 'application/json', body: JSON.stringify(
      { found: true, title: 'Test song', artist: 'Test', synced: fake, plain: null }) });
    r.continue();
  });
  await page.keyboard.press('k');
  await new Promise(r => setTimeout(r, 5000));
  const k = await page.evaluate(() => {
    const ka = window.__party.karaoke;
    return { on: ka.on, pos: ka.position(), cur: document.querySelector('.k-cur span').textContent,
      next: document.querySelector('.k-next').textContent, p: parseFloat(document.querySelector('.k-cur').style.getPropertyValue('--p')) };
  });
  const expected = Math.floor(k.pos / 2);
  await page.screenshot({ path: path.join(shots, 'karaoke.png') });
  check(k.on && k.cur === `Test line number ${expected}`, `karaoke: current line "${k.cur}" at ${k.pos.toFixed(1)} s`);
  check(k.next === `Test line number ${expected + 1}`, `karaoke: next line "${k.next}"`);
  check(k.p > 0 && k.p <= 100, `karaoke: progressive fill ${k.p}%`);
  check(errors.length === 0, `no JS errors in karaoke ${errors.join(' | ')}`);
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} tests failed` : '\nAll tests passed');
process.exit(failures ? 1 : 0);
