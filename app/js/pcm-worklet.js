// AudioWorklet that plays a stream of mono Float32 samples pushed from the page
// (system audio). Resamples linearly if the stream rate differs from the context rate,
// and keeps latency low by skipping ahead when too much audio is buffered.
// With no data it outputs silence (macOS sends nothing while the Mac is quiet).

class PcmFeed extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(sampleRate * 2);
    this.write = 0;          // next write index
    this.read = 0;           // fractional read position
    this.step = 1;           // input samples per output sample
    this.port.onmessage = e => {
      if (typeof e.data === 'number') this.step = e.data / sampleRate;
      else this.push(e.data);
    };
  }

  available() {
    return (this.write - Math.floor(this.read) + this.buf.length) % this.buf.length;
  }

  push(chunk) {
    const n = this.buf.length;
    for (let i = 0; i < chunk.length; i++) this.buf[(this.write + i) % n] = chunk[i];
    this.write = (this.write + chunk.length) % n;
    // more than 150 ms queued: drop the oldest audio, keep ~40 ms
    if (this.available() > 0.15 * sampleRate * this.step) {
      this.read = (this.write - Math.round(0.04 * sampleRate * this.step) + n) % n;
    }
  }

  process(_, outputs) {
    const out = outputs[0][0], n = this.buf.length;
    for (let i = 0; i < out.length; i++) {
      if (this.available() < 2) { out[i] = 0; continue; }
      const i0 = Math.floor(this.read), f = this.read - i0;
      out[i] = this.buf[i0] * (1 - f) + this.buf[(i0 + 1) % n] * f;
      this.read = (this.read + this.step) % n;
    }
    return true;
  }
}

registerProcessor('pcm-feed', PcmFeed);
