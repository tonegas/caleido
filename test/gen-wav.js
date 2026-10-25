// Genera una traccia di test: cassa a 120 BPM, basso, hi-hat e accordi.
const fs = require('fs');
const SR = 48000, SECS = +(process.argv[3] || 30), BPM = 120;
const n = SR * SECS, buf = Buffer.alloc(44 + n * 2);
const beat = 60 / BPM;
let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
for (let i = 0; i < n; i++) {
  const t = i / SR, tb = t % beat, t8 = t % (beat / 2);
  const kick = Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-tb * 30)) * tb) * Math.exp(-tb * 8);
  const bass = 0.3 * Math.sin(2 * Math.PI * [55, 55, 65.4, 49][Math.floor(t / (beat * 4)) % 4] * t) * (1 - Math.exp(-tb * 20));
  const hat = 0.12 * rnd() * Math.exp(-t8 * 60) * (t8 > 0.001 ? 1 : 0) * (Math.floor(t / (beat / 2)) % 2);
  const chord = 0.06 * [440, 554, 659].reduce((a, f) => a + Math.sin(2 * Math.PI * f * t), 0);
  const s = Math.max(-1, Math.min(1, 0.6 * kick + bass + hat + chord));
  buf.writeInt16LE(Math.round(s * 32000), 44 + i * 2);
}
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
fs.writeFileSync(process.argv[2] || 'test/beat120.wav', buf);
