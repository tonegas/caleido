import { AudioEngine } from './audio.js';
import { Visualizer } from './visualizer.js';
import { Milkdrop } from './milkdrop.js';
import { SCENE_NAMES } from './shaders.js';
import { Karaoke } from './karaoke.js';

const $ = id => document.getElementById(id);
const canvas = $('gl'), mdCanvas = $('md'), hud = $('hud'), help = $('help'), toast = $('toast'), start = $('start');

const audio = new AudioEngine();
const viz = new Visualizer(canvas);
let md = null;

const SYMS = [4, 5, 6, 8, 10, 12];
const state = {
  time: 0, dt: 1 / 60, hue: Math.random(), sym: 6, scene: 0, flash: 1,
  bass: 0, mid: 0, treble: 0, level: 0, beat: 0,
  auto: true, mode: 'shader', fps: 0, running: false,
  lastSceneChange: 0, lastSceneBeat: 0, lastSymBeat: 0, presetName: '',
};
let karaoke;
window.__party = { audio, state, viz, get md() { return md; }, get karaoke() { return karaoke; } };

const params = new URLSearchParams(location.search);
if (params.has('scene')) state.scene = +params.get('scene') % SCENE_NAMES.length;
if (params.has('auto')) state.auto = params.get('auto') !== '0';
if (params.has('hud')) hud.hidden = params.get('hud') === '0';

let toastTimer;
function say(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

karaoke = new Karaoke($('karaoke'), say);
if (params.get('karaoke') === '1') karaoke.start();

function setScene(i) {
  state.scene = (i + SCENE_NAMES.length) % SCENE_NAMES.length;
  state.lastSceneChange = state.time;
  state.lastSceneBeat = audio.beatCount;
  say(`Scena: ${SCENE_NAMES[state.scene]}`);
}

function setMode(mode) {
  if (mode === 'milkdrop') {
    if (!md) {
      md = new Milkdrop(mdCanvas, audio.ctx);
      if (!md.available()) { say('Milkdrop non disponibile'); md = null; return; }
      md.init(audio.source, viz.quality);
      state.presetName = md.names[md.index];
    }
    state.lastSceneChange = state.time;
    state.lastSceneBeat = audio.beatCount;
  }
  state.mode = mode;
  mdCanvas.hidden = mode !== 'milkdrop';
  canvas.hidden = mode === 'milkdrop';
  say(mode === 'milkdrop' ? `Milkdrop: ${state.presetName}` : `Scena: ${SCENE_NAMES[state.scene]}`);
}

function nextPreset() {
  if (!md) return;
  state.presetName = md.next();
  state.lastSceneChange = state.time;
  state.lastSceneBeat = audio.beatCount;
  say(`Milkdrop: ${state.presetName}`);
}

async function startAudio() {
  try {
    const label = await audio.start();
    start.hidden = true;
    state.running = true;
    if (md) md.connect(audio.source);
    say(`Microfono: ${label}`);
  } catch (e) {
    start.hidden = false;
    $('start-msg').textContent = `Microfono non disponibile (${e.name}). Clicca per riprovare e consenti l'accesso.`;
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}

window.addEventListener('keydown', async e => {
  const k = e.key;
  if (k === 'f' || k === 'F') toggleFullscreen();
  else if (k === ' ' || k === 'ArrowRight') state.mode === 'milkdrop' ? nextPreset() : setScene(state.scene + 1);
  else if (k === 'ArrowLeft') setScene(state.scene - 1);
  else if (k >= '1' && k <= String(SCENE_NAMES.length)) { if (state.mode !== 'shader') setMode('shader'); setScene(+k - 1); }
  else if (k === 'm' || k === 'M') setMode(state.mode === 'milkdrop' ? 'shader' : 'milkdrop');
  else if (k === 'n' || k === 'N') { if (state.mode !== 'milkdrop') setMode('milkdrop'); else nextPreset(); }
  else if (k === 'a' || k === 'A') { state.auto = !state.auto; say(`Cambio automatico: ${state.auto ? 'ON' : 'OFF'}`); }
  else if (k === 'b' || k === 'B') { state.flash = state.flash ? 0 : 1; say(`Flash sul beat: ${state.flash ? 'ON' : 'OFF'}`); }
  else if (k === 'ArrowUp') { audio.sensitivity = Math.min(3, audio.sensitivity + 0.1); say(`Sensibilità: ${audio.sensitivity.toFixed(1)}`); }
  else if (k === 'ArrowDown') { audio.sensitivity = Math.max(0.4, audio.sensitivity - 0.1); say(`Sensibilità: ${audio.sensitivity.toFixed(1)}`); }
  else if (k === 'i' || k === 'I') { const l = await audio.nextInput(); if (md) md.connect(audio.source); say(`Ingresso: ${l}`); }
  else if (k === 'k' || k === 'K') say(`Karaoke: ${karaoke.toggle() ? 'ON' : 'OFF'}`);
  else if (k === '[') karaoke.nudge(-0.25);
  else if (k === ']') karaoke.nudge(0.25);
  else if (k === 'q' || k === 'Q') { autoQuality = false; setQuality(viz.quality >= 2 ? 1 : viz.quality + 0.25); }
  else if (k === 'h' || k === 'H') { hud.hidden = !hud.hidden; help.hidden = hud.hidden; }
  else if (k === 'Escape') help.hidden = true;
});
window.addEventListener('dblclick', toggleFullscreen);
start.addEventListener('click', startAudio);
function setQuality(q, msg = true) {
  viz.quality = Math.round(Math.min(2, Math.max(1, q)) * 4) / 4;
  viz.resize();
  if (md) md.resize(viz.quality);
  if (msg) say(`Qualità: ${viz.quality}x`);
}
window.addEventListener('resize', () => setQuality(viz.quality, false));

// nasconde il cursore quando il mouse è fermo
let cursorTimer;
window.addEventListener('mousemove', () => {
  document.body.classList.remove('nocursor');
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.body.classList.add('nocursor'), 2000);
});

// evita che lo schermo si spenga durante la festa
async function keepAwake() {
  try { if ('wakeLock' in navigator) await navigator.wakeLock.request('screen'); } catch {}
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) keepAwake(); });
keepAwake();

let last = performance.now(), fpsAcc = 0, fpsN = 0, hudTimer = 0;
// qualità adattiva: se per 3 s si scende sotto 50 fps riduce la risoluzione interna
let autoQuality = true, slowTime = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  audio.update(dt);

  const prevBeats = state._beats ?? 0;
  const newBeat = audio.beatCount !== prevBeats;
  state._beats = audio.beatCount;

  state.dt = dt;
  state.time += dt * (0.7 + 0.6 * audio.level);
  state.bass = audio.bass; state.mid = audio.mid; state.treble = audio.treble;
  state.level = audio.level; state.beat = audio.beat;
  // i colori derivano verso suoni più "brillanti" e saltano sul beat
  state.hue = (state.hue + dt * (0.015 + 0.12 * audio.centroid) + (newBeat ? 0.04 + 0.08 * audio.bass : 0)) % 1;

  if (newBeat && audio.beatCount - state.lastSymBeat >= 8) {
    state.lastSymBeat = audio.beatCount;
    state.sym = SYMS[Math.floor(Math.random() * SYMS.length)];
  }
  if (state.auto) {
    const beats = audio.beatCount - state.lastSceneBeat, secs = state.time - state.lastSceneChange;
    if ((newBeat && beats >= 32) || secs > 45) {
      if (state.mode === 'milkdrop') nextPreset();
      else {
        let n; do { n = Math.floor(Math.random() * SCENE_NAMES.length); } while (n === state.scene);
        setScene(n);
      }
    }
  }

  karaoke.update();
  if (state.mode === 'milkdrop' && md) md.render();
  else viz.render(audio, state);

  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) {
    state.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    slowTime = state.fps < 50 ? slowTime + 0.5 : 0;
    if (autoQuality && slowTime >= 3 && viz.quality > 1) { slowTime = 0; setQuality(viz.quality - 0.25, false); }
  }
  hudTimer += dt;
  if (!hud.hidden && hudTimer > 0.1) {
    hudTimer = 0;
    const bar = v => '█'.repeat(Math.round(v * 10)).padEnd(10, '·');
    hud.textContent =
      `${state.mode === 'milkdrop' ? 'Milkdrop: ' + state.presetName : 'Scena: ' + SCENE_NAMES[state.scene]}  ` +
      `| simmetria ${state.sym} | ${audio.bpm || '--'} BPM | ${state.fps.toFixed(0)} fps ${viz.quality}x | auto ${state.auto ? 'on' : 'off'}\n` +
      `bassi  ${bar(audio.bass)}  medi ${bar(audio.mid)}  acuti ${bar(audio.treble)}  volume ${bar(audio.level)}  ` +
      `${audio.beat > 0.5 ? '● BEAT' : ''}`;
  }
  requestAnimationFrame(frame);
}

startAudio();
requestAnimationFrame(frame);
setTimeout(() => say('Premi H per i comandi'), 3500);
