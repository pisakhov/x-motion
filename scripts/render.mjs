#!/usr/bin/env node
// Trusted local compositions only: network isolation is not a security sandbox.
// Usage: node scripts/render.mjs composition/index.html --out renders/name [--video]
// Default: five storyboard PNGs + manifest. --video adds full frames and a SILENT MP4.
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

export const HELP = `Usage: node scripts/render.mjs <index.html> --out <directory> [--video]
Default: five storyboard PNGs and a SHA-256 manifest.
--video: also retain all frames and encode silent H.264/yuv420p film.mp4 with ffmpeg.
Requires Playwright Chromium (npx playwright install chromium); video requires ffmpeg.
Output directory must be absent or empty. Only trusted local compositions are supported.
Composition API: window.motion = {width,height,duration,fps}; window.renderFrame(seconds).
No audio is exported. Assets must be inside the composition directory; no remote requests.
`;

export function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const result = { video: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--video' && !result.video) result.video = true;
    else if (arg === '--out' && !result.out) {
      const value = args[++i];
      if (!value || value.startsWith('-')) throw new Error('--out requires a directory');
      result.out = value;
    } else if (!arg.startsWith('-') && !result.input) result.input = arg;
    else throw new Error(`Unknown or duplicate argument: ${arg}`);
  }
  if (!result.input || !result.out) throw new Error('An input HTML file and --out are required');
  if (!/\.html?$/i.test(result.input)) throw new Error('Input must be an HTML file');
  return result;
}

export function validateMotion(value) {
  if (!value || typeof value !== 'object') throw new Error('window.motion must be an object');
  const { width, height, duration, fps } = value;
  for (const [key, number] of Object.entries({ width, height })) {
    if (!Number.isInteger(number) || number < 2 || number > 3840 || number % 2)
      throw new Error(`${key} must be an even integer from 2 to 3840`);
  }
  if (!Number.isFinite(duration) || duration <= 0 || duration > 120)
    throw new Error('duration must be finite and in (0, 120] seconds');
  if (!Number.isInteger(fps) || fps < 1 || fps > 60)
    throw new Error('fps must be an integer from 1 to 60');
  return { width, height, duration, fps };
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
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4' };
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

async function evaluate(page, callback, argument) {
  let timer;
  try {
    return await Promise.race([
      page.evaluate(callback, argument),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Composition evaluation timed out')), 30_000); }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function render(options) {
  const input = await fs.realpath(options.input);
  if (!(await fs.stat(input)).isFile()) throw new Error('Input must be a file');
  const out = path.resolve(options.out);
  if (options.video) await command('ffmpeg', ['-version']);
  const { chromium } = await import('playwright');
  let server, browser, unlock;
  try {
    unlock = await prepareOutput(out);
    server = await startServer(path.dirname(input));
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
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failures.push(`Asset HTTP ${response.status()}: ${new URL(response.url()).pathname}`); });
    page.setDefaultTimeout(30_000);
    await page.goto(`${server.origin}/${encodeURIComponent(path.basename(input))}?render=1`, { waitUntil: 'networkidle', timeout: 30_000 });
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
    await fs.mkdir(path.join(out, 'storyboard'));
    for (const [index, time] of frameTimes(motion, true).entries()) await capture(time, `storyboard/${String(index).padStart(2, '0')}.png`);
    // Seek backward after visiting later frames: state must depend only on t.
    // For a sub-frame composition, this still checks repeated-timestamp stability.
    const repeatedHash = await capture(0);
    if (repeatedHash !== files[0].sha256) throw new Error('Determinism check failed: frame at t=0 changed after seeking');
    if (options.video) {
      await fs.mkdir(path.join(out, 'frames'));
      for (const [index, time] of frameTimes(motion).entries()) await capture(time, `frames/${String(index).padStart(6, '0')}.png`);
      await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-framerate', String(motion.fps), '-i', path.join(out, 'frames/%06d.png'), '-an', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(out, 'film.mp4')]);
      await record('film.mp4');
    }
    const manifest = { schemaVersion: 1, composition: path.basename(input), motion, audio: false, determinismCheck: { time: 0, afterTime: frameTimes(motion, true).at(-1), sha256: repeatedHash, passed: true }, mode: options.video ? 'video' : 'storyboard', playwrightVersion: (await import('playwright/package.json', { with: { type: 'json' } })).default.version, browserVersion: browser.version(), files };
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
    else { const manifest = await render(options); console.log(`Rendered ${manifest.files.length} files to ${path.resolve(options.out)} (${manifest.mode}, silent).`); }
  } catch (error) { console.error(`Render failed: ${error.message}`); process.exitCode = 1; }
}
