// Test end-to-end: Chrome headless con un microfono finto che "ascolta" test/beat120.wav.
// Verifica che: shader compilati, audio analizzato, beat ~120 BPM, ogni scena
// e la modalità Milkdrop disegnino immagini non nere. Salva screenshot in test/shots.
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
if (!fs.existsSync(wav)) spawnSync('node', [path.join(dir, 'gen-wav.js'), wav, '60']);   // traccia di prova a 120 BPM

const server = spawn('node', [path.join(root, 'server.js')], { env: { ...process.env, PORT } });
await new Promise(r => server.stdout.once('data', r));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: [
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-swiftshader', '--window-size=1280,720',
    '--disable-features=AudioServiceSandbox', // altrimenti Chrome non legge il file audio finto
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
  console.log('stato:', st);
  check(errors.length === 0, `nessun errore JS ${errors.join(' | ')}`);
  check(st.running, 'microfono attivo');
  check(st.specMax > 100, 'spettro con segnale');
  check(st.beats >= 8, `beat rilevati (${st.beats} in ~8s)`);
  check(Math.abs(st.bpm - 120) <= 6, `tempo stimato ${st.bpm} BPM (atteso 120)`);

  // media della luminosità del canvas visibile
  const brightness = () => page.evaluate(() => {
    const c = document.querySelector('canvas:not([hidden])');
    window.__party.md?.render(); // butterchurn non preserva il buffer: ridisegna nello stesso task
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
    check(name === i && b > 8, `scena ${i + 1} disegna (luminosità media ${b.toFixed(1)})`);
  }

  await page.keyboard.press('m');
  await new Promise(r => setTimeout(r, 4000));
  // alcuni preset sono scuri di natura: ne prova fino a 3
  let mb = await brightness();
  for (let i = 0; i < 2 && mb <= 8; i++) {
    await page.keyboard.press('n');
    await new Promise(r => setTimeout(r, 4000));
    mb = await brightness();
  }
  const mode = await page.evaluate(() => [window.__party.state.mode, window.__party.state.presetName]);
  await page.screenshot({ path: path.join(shots, 'milkdrop.png') });
  check(mode[0] === 'milkdrop' && mb > 8, `Milkdrop "${mode[1]}" disegna (luminosità ${mb.toFixed(1)})`);
  check(errors.length === 0, `nessun errore JS dopo i cambi scena ${errors.join(' | ')}`);

  // --- karaoke: player e testo simulati (righe inventate, una ogni 2 s) ---
  await page.keyboard.press('m');
  const t0 = Date.now() / 1000;
  const fake = Array.from({ length: 20 }, (_, i) => ({ t: i * 2, text: `Riga di prova numero ${i}` }));
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = r.url();
    if (u.includes('/api/nowplaying')) return r.respond({ contentType: 'application/json', body: JSON.stringify(
      { source: 'Spotify', title: 'Canzone di prova', artist: 'Test', album: '', duration: 40, position: Date.now() / 1000 - t0, playing: true, at: Date.now() / 1000 }) });
    if (u.includes('/api/lyrics')) return r.respond({ contentType: 'application/json', body: JSON.stringify(
      { found: true, title: 'Canzone di prova', artist: 'Test', synced: fake, plain: null }) });
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
  check(k.on && k.cur === `Riga di prova numero ${expected}`, `karaoke: riga corrente "${k.cur}" a ${k.pos.toFixed(1)} s`);
  check(k.next === `Riga di prova numero ${expected + 1}`, `karaoke: riga successiva "${k.next}"`);
  check(k.p > 0 && k.p <= 100, `karaoke: riempimento progressivo ${k.p}%`);
  check(errors.length === 0, `nessun errore JS nel karaoke ${errors.join(' | ')}`);
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} test falliti` : '\nTutti i test superati');
process.exit(failures ? 1 : 0);
