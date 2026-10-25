// Renders a square frame of the Mandala scene, driven by the 120 BPM test track.
import puppeteer from 'puppeteer-core';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const wav = path.join(root, 'test', 'beat120.wav');
if (!fs.existsSync(wav)) spawnSync('node', [path.join(root, 'test', 'gen-wav.js'), wav, '60']);
const server = spawn('node', [path.join(root, 'server.js')], { env: { ...process.env, PORT: 8791 } });
await new Promise(r => server.stdout.once('data', r));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`,
    '--disable-features=AudioServiceSandbox', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 1024, height: 1024 });
await p.goto('http://localhost:8791/?auto=0&scene=0&hud=0');
await p.evaluate(() => { window.__party.viz.quality = 1; window.__party.viz.resize(); });
await new Promise(r => setTimeout(r, 6000));
await p.screenshot({ path: process.argv[2] });
await b.close(); server.kill();
