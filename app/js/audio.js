// Microphone audio analysis: log spectrum, bands, level, beats.
// Every value is normalized with automatic gain control (AGC), so it works
// both with loud music and with distant ambient sound.

export const SPEC_BINS = 256;
export const WAVE_LEN = 512;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.source = null;
    this.analyser = null;
    this.stream = null;
    this.deviceId = null;

    this.spectrum = new Uint8Array(SPEC_BINS);   // 0..255 for the texture
    this.wave = new Uint8Array(WAVE_LEN);
    this.bass = 0; this.mid = 0; this.treble = 0; this.level = 0;
    this.centroid = 0;          // 0..1, "brightness" of the sound
    this.beat = 0;              // pulse 1 -> 0 after every beat
    this.beatCount = 0;
    this.bpm = 0;
    this.sensitivity = 1.0;     // adjustable with the up/down arrows

    this._topDb = -40;
    this._bandMax = [0.2, 0.2, 0.2, 0.2];
    this._bassHist = [];
    this._lastBeat = 0;
    this._beatTimes = [];
  }

  async start(deviceId = null) {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.stop();
    // No voice processing: echo/noise cancellation and AGC ruin music.
    const audio = {
      echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      channelCount: 1,
    };
    if (deviceId) audio.deviceId = { exact: deviceId };
    this.stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    this.deviceId = this.stream.getAudioTracks()[0]?.getSettings().deviceId || deviceId;
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0.5;
    this.analyser.minDecibels = -110;
    this.analyser.maxDecibels = -10;
    this.source.connect(this.analyser);
    // muted output to the destination: makes sure the audio graph gets processed
    if (!this._mute) { this._mute = this.ctx.createGain(); this._mute.gain.value = 0; this._mute.connect(this.ctx.destination); }
    this.analyser.connect(this._mute);
    this._freq = new Float32Array(this.analyser.frequencyBinCount);
    this._time = new Float32Array(this.analyser.fftSize);
    this._buildBins();
    return this.label();
  }

  stop() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.source) this.source.disconnect();
    this.stream = null; this.source = null;
  }

  label() {
    return this.stream?.getAudioTracks()[0]?.label || 'no input';
  }

  async listInputs() {
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs.filter(d => d.kind === 'audioinput');
  }

  async nextInput() {
    const ins = await this.listInputs();
    if (ins.length < 2) return this.label();
    const i = ins.findIndex(d => d.deviceId === this.deviceId);
    return this.start(ins[(i + 1) % ins.length].deviceId);
  }

  // Logarithmic mapping 30 Hz .. 16 kHz -> SPEC_BINS bands.
  _buildBins() {
    const nyq = this.ctx.sampleRate / 2, n = this._freq.length;
    const f0 = 30, f1 = Math.min(16000, nyq);
    this._binLo = new Uint16Array(SPEC_BINS);
    this._binHi = new Uint16Array(SPEC_BINS);
    this._binFreq = new Float32Array(SPEC_BINS);
    for (let i = 0; i < SPEC_BINS; i++) {
      const a = f0 * Math.pow(f1 / f0, i / SPEC_BINS);
      const b = f0 * Math.pow(f1 / f0, (i + 1) / SPEC_BINS);
      const lo = Math.floor(a / nyq * n), hi = Math.max(lo + 1, Math.ceil(b / nyq * n));
      this._binLo[i] = clamp(lo, 0, n - 1);
      this._binHi[i] = clamp(hi, 1, n);
      this._binFreq[i] = Math.sqrt(a * b);
    }
  }

  update(dt) {
    if (!this.analyser) return;
    dt = Math.min(dt, 0.1);
    const now = performance.now() / 1000;
    this.analyser.getFloatFrequencyData(this._freq);
    this.analyser.getFloatTimeDomainData(this._time);

    // --- spectrum with AGC in dB: the [top-48, top] window follows the peak ---
    const db = new Float32Array(SPEC_BINS);
    let peak = -200;
    for (let i = 0; i < SPEC_BINS; i++) {
      let m = -200;
      for (let k = this._binLo[i]; k < this._binHi[i]; k++) if (this._freq[k] > m) m = this._freq[k];
      // compensate the natural tilt of music (highs carry less energy)
      m += 3.0 * Math.log2(this._binFreq[i] / 200);
      db[i] = m;
      if (m > peak) peak = m;
    }
    if (peak > this._topDb) this._topDb += (peak - this._topDb) * Math.min(1, dt * 20);
    else this._topDb -= dt * 4;                       // falls 4 dB/s
    this._topDb = Math.max(this._topDb, -75 + 10 * (this.sensitivity - 1)); // don't amplify silence
    const range = 48 / this.sensitivity, bottom = this._topDb - range;

    let bass = 0, mid = 0, tre = 0, nb = 0, nm = 0, nt = 0, cw = 0, cs = 0;
    for (let i = 0; i < SPEC_BINS; i++) {
      const v = clamp((db[i] - bottom) / range, 0, 1);
      const sv = v * v;
      const prev = this.spectrum[i] / 255;
      const s = sv > prev ? sv : prev + (sv - prev) * Math.min(1, dt * 12);
      this.spectrum[i] = s * 255;
      const f = this._binFreq[i];
      if (f < 150) { bass += sv; nb++; }
      else if (f < 2000) { mid += sv; nm++; }
      else if (f < 12000) { tre += sv; nt++; }
      cw += sv; cs += sv * i;
    }
    bass /= nb || 1; mid /= nm || 1; tre /= nt || 1;
    const centroid = cw > 0 ? cs / cw / SPEC_BINS : 0;

    // --- RMS level + waveform (aligned to a zero crossing) ---
    let rms = 0, amax = 1e-4;
    for (let i = 0; i < this._time.length; i++) {
      const s = this._time[i]; rms += s * s; if (Math.abs(s) > amax) amax = Math.abs(s);
    }
    rms = Math.sqrt(rms / this._time.length);
    let z = 0;
    for (let i = 1; i < this._time.length - WAVE_LEN; i++) {
      if (this._time[i - 1] < 0 && this._time[i] >= 0) { z = i; break; }
    }
    // light low-pass: the mic waveform is noisy and would look jagged
    const wg = 0.9 / amax, w = this._waveF || (this._waveF = new Float32Array(WAVE_LEN));
    for (let i = 0; i < WAVE_LEN; i++) w[i] = this._time[z + i];
    for (let pass = 0; pass < 3; pass++) {
      let prev = w[0];
      for (let i = 1; i < WAVE_LEN - 1; i++) { const c = w[i]; w[i] = 0.25 * prev + 0.5 * c + 0.25 * w[i + 1]; prev = c; }
    }
    for (let i = 0; i < WAVE_LEN; i++) this.wave[i] = clamp(128 + w[i] * wg * 127, 0, 255);

    // --- per-band AGC: each value relative to its own recent maximum ---
    const raw = [bass, mid, tre, rms];
    const out = raw.map((v, i) => {
      this._bandMax[i] = Math.max(v, this._bandMax[i] * Math.exp(-dt * 0.25), i === 3 ? 0.002 : 0.02);
      return clamp(v / this._bandMax[i], 0, 1);
    });
    const follow = (cur, target) =>
      cur + (target - cur) * Math.min(1, dt * (target > cur ? 30 : 6));
    this.bass = follow(this.bass, out[0]);
    this.mid = follow(this.mid, out[1]);
    this.treble = follow(this.treble, out[2]);
    this.level = follow(this.level, out[3]);
    this.centroid += (centroid - this.centroid) * Math.min(1, dt * 3);

    // --- beat detection on bass energy ---
    const h = this._bassHist;
    h.push(bass);
    while (h.length > 50) h.shift();
    const avg = h.reduce((a, b) => a + b, 0) / h.length;
    const varc = h.reduce((a, b) => a + (b - avg) * (b - avg), 0) / h.length;
    const thr = avg + Math.max(0.03, 1.3 * Math.sqrt(varc));
    if (bass > thr && bass > 0.04 && now - this._lastBeat > 0.27 && h.length > 20) {
      const gap = now - this._lastBeat;
      this._lastBeat = now;
      this.beat = 1;
      this.beatCount++;
      if (gap < 1.5) {
        this._beatTimes.push(gap);
        if (this._beatTimes.length > 16) this._beatTimes.shift();
        const sorted = [...this._beatTimes].sort((a, b) => a - b);
        this.bpm = Math.round(60 / sorted[sorted.length >> 1]);
      }
    } else {
      this.beat *= Math.exp(-dt * 5);
    }
  }
}
