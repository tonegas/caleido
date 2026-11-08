// Stands in for scripts/sysaudio in the tests: streams a 16-bit mono WAV in real time
// in the same format ("RATE <n>\n" + mono Float32 samples).
// Optional second argument: stop after that many seconds (to test reconnection).
const fs = require('fs');
const wav = fs.readFileSync(process.argv[2]);
const rate = wav.readUInt32LE(24), data = wav.subarray(44);
process.stdout.write(`RATE ${rate}\n`);
const chunk = Math.round(rate / 50);   // 20 ms
let pos = 0;
setInterval(() => {
  const out = Buffer.alloc(chunk * 4);
  for (let i = 0; i < chunk; i++, pos = (pos + 1) % (data.length / 2)) out.writeFloatLE(data.readInt16LE(pos * 2) / 32768, i * 4);
  if (!process.stdout.write(out)) return;
}, 20);
process.stdout.on('error', () => process.exit(0));
if (process.argv[3]) setTimeout(() => process.exit(0), +process.argv[3] * 1000);
