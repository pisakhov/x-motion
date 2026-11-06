#!/usr/bin/env node
// Original procedural sound study. No samples, network, or third-party music.
import {writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
const target = process.argv[2];
if (!target || process.argv.length !== 3) {
  console.error('Usage: node scripts/first-light-audio.mjs renders/first-light/sound.wav');
  process.exit(1);
}
const rate = 48000, duration = 6, frames = rate * duration;
const pcm = new Float64Array(frames);
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
let seed = 8127, peak = 0;
for (let i = 0; i < frames; i++) {
  const t = i / rate;
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const noise = seed / 4294967296 * 2 - 1;
  const bed = smooth(t / 1.4) * (1 - smooth((t - 4.1) / 1.7));
  const aperture = Math.exp(-Math.pow((t - 2.8) / .48, 2));
  const hitT = t - 3.7;
  const resolveTone = hitT > 0 ? (1 - Math.exp(-hitT * 40)) * Math.exp(-hitT * 2.6) * (Math.sin(2 * Math.PI * 440 * hitT) + .35 * Math.sin(2 * Math.PI * 660 * hitT)) : 0;
  pcm[i] = .09 * bed * (Math.sin(2 * Math.PI * 55 * t) + .3 * Math.sin(2 * Math.PI * 82.5 * t)) + .035 * aperture * noise + .12 * resolveTone;
  pcm[i] *= smooth(t / .03) * (1 - smooth((t - 5.7) / .3));
  peak = Math.max(peak, Math.abs(pcm[i]));
}
// Peak normalization to -6 dBFS is not a loudness certification.
const gain = peak > 0 ? Math.pow(10, -6 / 20) / peak : 1;
const wav = Buffer.alloc(44 + frames * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
for (let i = 0; i < frames; i++) wav.writeInt16LE(Math.round(pcm[i] * gain * 32767), 44 + i * 2);
await mkdir(dirname(resolve(target)), {recursive: true});
await writeFile(target, wav, {flag: 'wx'});
console.log(`Wrote original 6s mono sound study: ${target}; sample peak -6 dBFS, listening review required.`);
