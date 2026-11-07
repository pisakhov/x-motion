#!/usr/bin/env node
// Trusted local compositions only: network isolation is not a security sandbox.
// Usage: node scripts/render.mjs composition/index.html --out renders/name [--root dir] [--times a,b] [--audio] [--video]
// Default: five storyboard PNGs + manifest. --audio exports the composition's score; --video adds frames, poster and MP4.
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

export const HELP = `Usage: node scripts/render.mjs <index.html> --out <directory> [--root <directory>] [--times a,b,c] [--audio] [--video]
Default: five storyboard PNGs and a SHA-256 manifest.
--times: capture these timestamps (seconds) instead of the five storyboard frames.
--audio: also export sound.wav from window.renderAudio and record loudness in the manifest.
--root: serve this directory instead of the composition's own, so a page can load shared
        files such as ../reel/reel.js. The composition must be inside it.
--video: also retain all frames, write poster.webp and encode H.264/yuv420p film.mp4.
         When window.renderAudio exists, its score is muxed as AAC 192 kb/s.
Requires Playwright Chromium (npx playwright install chromium); audio and video require ffmpeg.
Output directory must be absent or empty. Only trusted local compositions are supported.
Composition API: window.motion = {width,height,duration,fps[,poster]}; window.renderFrame(seconds);
optional window.renderAudio({sampleRate}) returning an AudioBuffer (e.g. from OfflineAudioContext).
Math.random is replaced by a fixed-seed generator in render mode (in every frame, including
iframes). Assets must be inside the composition directory (or --root); no remote requests.
renderAudio may take up to max(30, 3 x duration) seconds.
`;
export const SAMPLE_RATE = 48000;

export function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const result = { video: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--video' && !result.video) result.video = true;
    else if (arg === '--audio' && !result.audio) result.audio = true;
    else if (arg === '--times' && !result.times) {
      const value = args[++i];
      if (!value || !/^\d+(?:\.\d+)?(?:,\d+(?:\.\d+)?)*$/.test(value)) throw new Error('--times requires comma-separated seconds, e.g. 0,1.5,3');
      result.times = value.split(',').map(Number);
      if (result.times.length > 60) throw new Error('--times accepts at most 60 timestamps');
    } else if (arg === '--out' && !result.out) {
      const value = args[++i];
      if (!value || value.startsWith('-')) throw new Error('--out requires a directory');
      result.out = value;
    } else if (arg === '--root' && !result.root) {
      const value = args[++i];
      if (!value || value.startsWith('-')) throw new Error('--root requires a directory');
      result.root = value;
    } else if (!arg.startsWith('-') && !result.input) result.input = arg;
    else throw new Error(`Unknown or duplicate argument: ${arg}`);
  }
  if (!result.input || !result.out) throw new Error('An input HTML file and --out are required');
  if (!/\.html?$/i.test(result.input)) throw new Error('Input must be an HTML file');
  return result;
}

export function validateMotion(value) {
  if (!value || typeof value !== 'object') throw new Error('window.motion must be an object');
  const { width, height, duration, fps, poster } = value;
  for (const [key, number] of Object.entries({ width, height })) {
    if (!Number.isInteger(number) || number < 2 || number > 3840 || number % 2)
      throw new Error(`${key} must be an even integer from 2 to 3840`);
  }
  if (!Number.isFinite(duration) || duration <= 0 || duration > 120)
    throw new Error('duration must be finite and in (0, 120] seconds');
  if (!Number.isInteger(fps) || fps < 1 || fps > 60)
    throw new Error('fps must be an integer from 1 to 60');
  if (poster !== undefined && (!Number.isFinite(poster) || poster < 0 || poster >= duration))
    throw new Error('poster must be a time in [0, duration) seconds');
  return poster === undefined ? { width, height, duration, fps } : { width, height, duration, fps, poster };
}

export function frameTimes(motion, storyboard = false) {
  const { duration, fps } = validateMotion(motion);
  let count = Math.ceil(duration * fps);
  // Decimal multiplication can round an exact frame boundary slightly upward.
  if (count > 1 && (count - 1) / fps >= duration) count--;
  if (storyboard) return Array.from({ length: 5 }, (_, i) => Math.round((count - 1) * i / 4) / fps);
  return Array.from({ length: count }, (_, i) => i / fps);
}

const inside = (root, file) => file === root || (!path.relative(root, file).startsWith(`..${path.sep}`) && path.relative(root, file) !== '..' && !path.isAbsolute(path.relative(root, file)));
export async function resolveAsset(root, requestPath) {
  let decoded;
  try { decoded = decodeURIComponent(requestPath.split('?')[0]); }
  catch { throw new Error('Malformed asset path'); }
  if (!decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').includes('..'))
    throw new Error('Unsafe asset path');
  const base = await fs.realpath(root);
  const candidate = path.resolve(base, `.${decoded}`);
  if (!inside(base, candidate)) throw new Error('Asset escapes composition directory');
  const real = await fs.realpath(candidate);
  if (!inside(base, real)) throw new Error('Asset symlink escapes composition directory');
  if (!(await fs.stat(real)).isFile()) throw new Error('Asset is not a file');
  return real;
}

export async function startServer(root) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.vtt': 'text/vtt', '.mp4': 'video/mp4' };
  const server = createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
      const file = await resolveAsset(root, req.url);
      const body = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404).end('Asset unavailable'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }) };
}

export async function prepareOutput(directory) {
  await fs.mkdir(directory, { recursive: true });
  if ((await fs.readdir(directory)).length) throw new Error('Refusing to overwrite a nonempty output directory');
  const lock = path.join(directory, '.render-lock');
  await fs.writeFile(lock, '', { flag: 'wx' });
  return () => fs.unlink(lock);
}

function command(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-8000); });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${executable} exited ${code}: ${stderr}`)));
  });
}

function output(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-20000); });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve(stderr) : reject(new Error(`${executable} exited ${code}: ${stderr.slice(-4000)}`)));
  });
}

// Interleaved little-endian PCM16 → canonical 44-byte RIFF/WAVE.
export function wavFile(pcm, channels, sampleRate) {
  if (![1, 2].includes(channels) || !Number.isInteger(sampleRate) || pcm.length % (2 * channels)) throw new Error('Invalid PCM layout');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function parseLoudness(text) {
  const summary = text.slice(text.lastIndexOf('Summary:'));
  const value = pattern => { const match = pattern.exec(summary); return match && match[1] !== '-inf' ? Number(match[1]) : null; };
  return { integratedLufs: value(/I:\s+(-?[\d.]+|-inf) LUFS/), loudnessRangeLu: value(/LRA:\s+(-?[\d.]+) LU/), truePeakDbfs: value(/Peak:\s+(-?[\d.]+|-inf) dBFS/) };
}

async function evaluate(page, callback, argument, timeout = 30_000) {
  let timer;
  try {
    return await Promise.race([
      page.evaluate(callback, argument),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Composition evaluation timed out')), timeout); }),
    ]);
  } finally { clearTimeout(timer); }
}

// Resolve the served directory and the composition's URL path within it (symlinks resolved first).
export async function servedPage(inputPath, rootPath) {
  const input = await fs.realpath(inputPath);
  if (!(await fs.stat(input)).isFile()) throw new Error('Input must be a file');
  const root = rootPath ? await fs.realpath(rootPath) : path.dirname(input);
  if (!(await fs.stat(root)).isDirectory()) throw new Error('--root must be a directory');
  if (!inside(root, input) || root === input) throw new Error('The composition must be inside --root');
  return { input, root, pagePath: path.relative(root, input).split(path.sep).map(encodeURIComponent).join('/') };
}

export async function render(options) {
  const { input, root, pagePath } = await servedPage(options.input, options.root);
  const out = path.resolve(options.out);
  if (options.video || options.audio) await command('ffmpeg', ['-version']);
  const { chromium } = await import('playwright');
  let server, browser, unlock;
  try {
    unlock = await prepareOutput(out);
    server = await startServer(root);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', colorScheme: 'dark', reducedMotion: 'no-preference', serviceWorkers: 'block' });
    const failures = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === server.origin) return route.continue();
      failures.push(`Blocked network request: ${url.protocol}//${url.host}`);
      return route.abort('blockedbyclient');
    });
    await context.routeWebSocket('**/*', socket => { failures.push('WebSocket requests are unsupported'); socket.close(); });
    // Deterministic stand-in for unseeded randomness (mulberry32, fixed seed) before any composition script runs.
    await context.addInitScript(() => {
      let state = 0x9e3779b9;
      Math.random = () => { state = (state + 0x6d2b79f5) | 0; let x = Math.imul(state ^ (state >>> 15), 1 | state); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failures.push(`Asset HTTP ${response.status()}: ${new URL(response.url()).pathname}`); });
    page.setDefaultTimeout(30_000);
    await page.goto(`${server.origin}/${pagePath}?render=1`, { waitUntil: 'networkidle', timeout: 30_000 });
    const motion = validateMotion(await evaluate(page, () => window.motion));
    await page.setViewportSize({ width: motion.width, height: motion.height });
    await evaluate(page, async () => {
      if (typeof window.renderFrame !== 'function') throw new Error('window.renderFrame must be a function');
      await document.fonts.ready;
    });
    const files = [];
    const record = async (file, time) => {
      const bytes = await fs.readFile(path.join(out, file));
      files.push({ file, ...(time === undefined ? {} : { time }), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    };
    const capture = async (time, file) => {
      if (!Number.isFinite(time) || time < 0 || time >= motion.duration) throw new Error('Invalid frame timestamp');
      await evaluate(page, async time => {
        let timer;
        try {
          await Promise.race([
            (async () => {
              await window.renderFrame(time);
              await document.fonts.ready;
              await Promise.all([...document.images].map(image => image.decode()));
            })(),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('renderFrame/assets timed out')), 30_000); }),
          ]);
        } finally { clearTimeout(timer); }
      }, time);
      if (failures.length) throw new Error(failures.join('\n'));
      const image = await page.screenshot({ ...(file ? { path: path.join(out, file) } : {}), type: 'png', animations: 'allow', caret: 'hide', timeout: 30_000 });
      if (failures.length) throw new Error(failures.join('\n'));
      if (file) await record(file, time);
      return createHash('sha256').update(image).digest('hex');
    };
    const boardTimes = options.times ?? frameTimes(motion, true);
    for (const time of boardTimes) if (time >= motion.duration) throw new Error(`--times value ${time} is outside the ${motion.duration}s duration`);
    await fs.mkdir(path.join(out, 'storyboard'));
    for (const [index, time] of boardTimes.entries()) await capture(time, `storyboard/${String(index).padStart(2, '0')}.png`);
    // Seek backward after visiting later frames: state must depend only on t.
    // For a sub-frame composition, this still checks repeated-timestamp stability.
    const repeatedHash = await capture(boardTimes[0]);
    if (repeatedHash !== files[0].sha256) throw new Error(`Determinism check failed: frame at t=${boardTimes[0]} changed after seeking`);
    const hasAudio = await evaluate(page, () => typeof window.renderAudio === 'function');
    if (options.audio && !hasAudio) throw new Error('--audio requires window.renderAudio');
    let audio = null;
    if (hasAudio && (options.audio || options.video)) {
      const frames = Math.round(motion.duration * SAMPLE_RATE);
      const renderPcm = () => evaluate(page, async ({ sampleRate, frames }) => {
        const buffer = await window.renderAudio({ sampleRate });
        if (!buffer || typeof buffer.getChannelData !== 'function') throw new Error('renderAudio must return an AudioBuffer');
        if (buffer.sampleRate !== sampleRate) throw new Error(`renderAudio returned ${buffer.sampleRate} Hz; expected ${sampleRate}`);
        if (![1, 2].includes(buffer.numberOfChannels)) throw new Error('renderAudio must return one or two channels');
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
        const bytes = new Uint8Array(frames * channels.length * 2), view = new DataView(bytes.buffer);
        let peak = 0, clipped = 0;
        for (let i = 0; i < frames; i++) for (let c = 0; c < channels.length; c++) {
          const sample = i < buffer.length ? channels[c][i] : 0;
          if (!Number.isFinite(sample)) throw new Error('renderAudio produced a non-finite sample');
          const magnitude = Math.abs(sample); if (magnitude > peak) peak = magnitude; if (magnitude > 1) clipped++;
          view.setInt16((i * channels.length + c) * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true);
        }
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return { channels: channels.length, sourceFrames: buffer.length, peak, clipped, base64: btoa(binary) };
      }, { sampleRate: SAMPLE_RATE, frames }, Math.max(30_000, Math.ceil(motion.duration * 3000)));
      const first = await renderPcm(), second = await renderPcm();
      if (first.base64 !== second.base64) throw new Error('Audio determinism check failed: renderAudio returned different samples on a second call');
      const wav = wavFile(Buffer.from(first.base64, 'base64'), first.channels, SAMPLE_RATE);
      await fs.writeFile(path.join(out, 'sound.wav'), wav, { flag: 'wx' });
      await record('sound.wav');
      const loudness = parseLoudness(await output('ffmpeg', ['-hide_banner', '-nostats', '-nostdin', '-i', path.join(out, 'sound.wav'), '-af', 'ebur128=peak=true', '-f', 'null', '-']));
      audio = { sampleRate: SAMPLE_RATE, channels: first.channels, frames, sourceFrames: first.sourceFrames, samplePeak: first.peak, clippedSamples: first.clipped, determinismCheck: { passed: true, sha256: createHash('sha256').update(wav).digest('hex') }, ...loudness };
    }
    if (options.video) {
      await fs.mkdir(path.join(out, 'frames'));
      const times = frameTimes(motion);
      for (const [index, time] of times.entries()) await capture(time, `frames/${String(index).padStart(6, '0')}.png`);
      const posterTime = motion.poster ?? 0;
      const posterIndex = Math.min(times.length - 1, Math.round(posterTime * motion.fps));
      await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-i', path.join(out, `frames/${String(posterIndex).padStart(6, '0')}.png`), '-c:v', 'libwebp', '-quality', '90', path.join(out, 'poster.webp')]);
      await record('poster.webp', times[posterIndex]);
      const audioInput = audio ? ['-i', path.join(out, 'sound.wav')] : [];
      const audioCodec = audio ? ['-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k'] : ['-an'];
      await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-framerate', String(motion.fps), '-i', path.join(out, 'frames/%06d.png'), ...audioInput, ...audioCodec, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-threads', '1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(out, 'film.mp4')]);
      await record('film.mp4');
    }
    const manifest = { schemaVersion: 2, composition: path.basename(input), motion, audio, determinismCheck: { time: boardTimes[0], afterTime: boardTimes.at(-1), sha256: repeatedHash, passed: true }, mode: options.video ? 'video' : 'storyboard', playwrightVersion: (await import('playwright/package.json', { with: { type: 'json' } })).default.version, browserVersion: browser.version(), files };
    await fs.writeFile(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    return manifest;
  } finally {
    // Attempt every cleanup even if an earlier cleanup fails.
    const results = await Promise.allSettled([browser?.close(), server?.close(), unlock?.()]);
    for (const result of results) if (result.status === 'rejected') console.error(`Cleanup failed: ${result.reason.message}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) console.log(HELP);
    else { const manifest = await render(options); console.log(`Rendered ${manifest.files.length} files to ${path.resolve(options.out)} (${manifest.mode}, ${manifest.audio ? `audio ${manifest.audio.integratedLufs} LUFS, true peak ${manifest.audio.truePeakDbfs} dBFS` : 'silent'}).`); }
  } catch (error) { console.error(`Render failed: ${error.message}`); process.exitCode = 1; }
}
