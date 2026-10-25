// Verifica con il microfono reale: stampa livelli per 10 s (fai rumore / metti musica).
import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';
const server = spawn('node', [new URL('../server.js', import.meta.url).pathname], { env: { ...process.env, PORT: 8796 } });
await new Promise(r => server.stdout.once('data', r));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.goto('http://localhost:8796/?auto=0');
for (let i = 0; i < 10; i++) {
  await new Promise(r => setTimeout(r, 1000));
  console.log(await page.evaluate(() => { const a = window.__party.audio;
    return `${a.label()} | topDb ${a._topDb.toFixed(1)} | bassi ${a.bass.toFixed(2)} medi ${a.mid.toFixed(2)} acuti ${a.treble.toFixed(2)} vol ${a.level.toFixed(2)} | beat ${a.beatCount}`; }));
}
await browser.close(); server.kill();
