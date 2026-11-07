#!/usr/bin/env node
// End-to-end check of the built gallery in Chromium: themes, film pages, prompt and skill copy,
// skill Markdown, keyboard stepping, 404, reduced motion and four viewport widths.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveAsset } from './render.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

// Local stand-in for nginx: directory index, 404 page, byte ranges and the same content types.
async function serveDist() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    let file;
    try {
      file = await resolveAsset(dist, url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname);
    } catch {
      if (!url.pathname.endsWith('/') && await resolveAsset(dist, `${url.pathname}/index.html`).then(() => true, () => false)) { res.writeHead(301, { Location: `${url.pathname}/` }).end(); return; }
      res.writeHead(404, { 'Content-Type': types['.html'] }).end(await fs.readFile(path.join(dist, '404.html')));
      return;
    }
    const body = await fs.readFile(file);
    const headers = { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    if (range) {
      const start = Number(range[1]), end = Math.min(range[2] ? Number(range[2]) : body.length - 1, body.length - 1);
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': end - start + 1 }).end(body.subarray(start, end + 1));
    } else res.writeHead(200, { ...headers, 'Content-Length': body.length }).end(req.method === 'HEAD' ? undefined : body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}

const local = process.env.GALLERY_URL ? null : await serveDist();
const origin = (process.env.GALLERY_URL || local.origin).replace(/\/$/, '');
const catalog = JSON.parse(await fs.readFile(path.join(dist, 'catalog.json'), 'utf8'));
const artifacts = path.join(root, '.artifacts/gallery');
await fs.mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [];
const note = text => checks.push(text);

async function layoutAudit(page, label) {
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth ? [] : [...document.querySelectorAll('body *')]
    .filter(item => item.getBoundingClientRect().right > innerWidth + 0.5).slice(0, 6)
    .map(item => `${item.tagName.toLowerCase()}.${item.className} right=${Math.round(item.getBoundingClientRect().right)}`));
  assert.deepEqual(overflow, [], `Horizontal overflow: ${label}`);
  const small = await page.locator('button:visible, .chip:visible, .step:visible, .back:visible').evaluateAll(items => items
    .filter(item => { const box = item.getBoundingClientRect(); return box.height < 44 || box.width < 44; })
    .map(item => item.textContent.trim()));
  assert.deepEqual(small, [], `Controls under 44px: ${label}`);
  const dashes = await page.evaluate(() => document.body.innerText.includes('\u2014'));
  assert.equal(dashes, false, `Em dash in visible copy: ${label}`);
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text()); });
  // Every failed response is an error except the deliberate missing-page probe below.
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/no-such-film/')) errors.push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => { if (!/ERR_ABORTED/.test(request.failure()?.errorText ?? '')) errors.push(`failed ${request.url()}`); });

  const live = await (await page.request.get(`${origin}/catalog.json`)).json();
  assert.deepEqual(live, catalog);
  assert.equal('feedback' in live, false);
  assert.equal(live.motions.some(film => film.status === 'discarded'), false);
  const byTheme = new Map(catalog.themes.map(theme => [theme.slug, catalog.motions.filter(film => film.theme === theme.slug)]));

  // Home: one chapter per theme, each opening its theme page.
  await page.goto(`${origin}/`);
  assert.equal(await page.locator('.chapter').count(), catalog.themes.length);
  for (const theme of catalog.themes) {
    const chapter = page.locator(`.chapter[href="/${theme.slug}/"]`);
    assert.equal(await chapter.locator('h2').innerText(), theme.title);
  }
  await layoutAudit(page, 'home 1440');
  await page.screenshot({ path: path.join(artifacts, 'home-1440.png') });
  note(`${catalog.themes.length} theme chapters`);

  for (const theme of catalog.themes) {
    const films = byTheme.get(theme.slug);
    await page.goto(`${origin}/`);
    await page.locator(`.chapter[href="/${theme.slug}/"]`).click();
    await page.waitForURL(`${origin}/${theme.slug}/`);
    assert.equal(await page.locator('h1').innerText(), theme.title);
    assert.equal(await page.locator('.tile').count(), films.length);
    assert.equal(await page.locator(`.theme-head a.chip[href="/skills/${theme.skill}/"]`).count(), 1);
    await layoutAudit(page, `${theme.slug} 1440`);

    for (const [index, film] of films.entries()) {
      await page.goto(`${origin}/${theme.slug}/`);
      await page.locator(`.tile[href="/m/${film.id}/"]`).click();
      await page.waitForURL(`${origin}/m/${film.id}/`);
      assert.equal(await page.locator('h1').innerText(), film.title);
      const player = page.locator('#player');
      await page.waitForFunction(() => document.querySelector('#player').readyState >= 1);
      const details = await player.evaluate(video => ({ duration: video.duration, width: video.videoWidth, height: video.videoHeight, paused: video.paused }));
      assert.equal(details.width, film.width);
      assert.equal(details.height, film.height);
      assert.ok(Math.abs(details.duration - film.duration) < 0.1, `${film.id} duration ${details.duration}`);
      assert.equal(details.paused, true, `${film.id} must not autoplay`);
      await player.evaluate(async video => { video.muted = true; await video.play(); });
      await page.waitForFunction(() => document.querySelector('#player').currentTime > 0.15);
      await player.evaluate(video => video.pause());

      assert.equal((await page.locator('#prompt').innerText()).trim(), film.prompt);
      await page.locator('[data-copy-target="prompt"]').click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), film.prompt);
      await page.locator('button.id').click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), film.id);
      const chips = await page.locator('.chips a.chip').evaluateAll(items => items.map(item => item.getAttribute('href')));
      assert.deepEqual(chips, film.skills.map(skill => `/skills/${skill}/`));
      await layoutAudit(page, `${film.id} 1440`);

      if (films.length > 1) {
        const next = films[(index + 1) % films.length], previous = films[(index - 1 + films.length) % films.length];
        await page.locator('body').click({ position: { x: 4, y: 300 } });
        await page.keyboard.press('ArrowRight');
        await page.waitForURL(`${origin}/m/${next.id}/`);
        await page.keyboard.press('ArrowLeft');
        await page.waitForURL(`${origin}/m/${film.id}/`);
        assert.equal(await page.locator('.step[rel="prev"]').getAttribute('href'), `/m/${previous.id}/`);
      }
    }
  }
  note(`${catalog.motions.length} film pages with metadata, playback, prompt and ID copy, arrow keys`);

  // Skills: every chip resolves, and Copy Markdown yields the raw file byte for byte.
  const skillNames = [...new Set([...catalog.themes.map(theme => theme.skill), ...catalog.motions.flatMap(film => film.skills)])];
  for (const name of skillNames) {
    await page.goto(`${origin}/skills/${name}/`);
    const raw = await page.request.get(`${origin}/skills/${name}/SKILL.md`);
    assert.equal(raw.status(), 200);
    assert.match(raw.headers()['content-type'], /^text\/markdown/);
    const text = await raw.text();
    assert.equal(text, await fs.readFile(path.join(root, 'skills', name, 'SKILL.md'), 'utf8'));
    await page.locator('[data-copy-url]').click();
    await page.locator('[data-copy-url][data-state="done"]').waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), text);
    assert.equal(await page.locator('a[download]').getAttribute('href'), `/skills/${name}/SKILL.md`);
    for (const href of await page.locator('.md a[href^="/skills/"]').evaluateAll(items => items.map(item => item.getAttribute('href'))))
      assert.equal((await page.request.get(`${origin}${href}`)).status(), 200, `Broken skill link ${href}`);
    await layoutAudit(page, `skill ${name} 1440`);
  }
  await page.goto(`${origin}/skills/`);
  assert.equal(await page.locator('.skill-list li').count(), (await fs.readdir(path.join(root, 'skills'))).length);
  note(`${skillNames.length} skill pages with raw Markdown copy and download`);

  const missing = await page.goto(`${origin}/no-such-film/`);
  assert.equal(missing.status(), 404);
  await page.getByText('Nothing here.').waitFor();
  const redirect = await page.request.get(`${origin}/${catalog.themes[0].slug}`, { maxRedirects: 0 });
  assert.equal(redirect.status(), 301);
  assert.equal(redirect.headers().location, `/${catalog.themes[0].slug}/`);
  note('404 page and relative directory redirects');

  // Responsive widths: no overflow, no undersized controls.
  const sample = catalog.motions[0];
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 860 });
    for (const route of ['/', `/${catalog.themes[0].slug}/`, `/m/${sample.id}/`, '/skills/x-motion/']) {
      await page.goto(`${origin}${route}`);
      await layoutAudit(page, `${route} ${width}`);
    }
    await page.goto(`${origin}/`);
    await page.screenshot({ path: path.join(artifacts, `home-${width}.png`) });
  }
  note('four viewport widths');

  // Reduced motion: preview loops never start.
  const calm = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const still = await calm.newPage();
  await still.goto(`${origin}/`);
  await still.waitForTimeout(1200);
  assert.deepEqual(await still.locator('video.loop').evaluateAll(items => items.filter(video => !video.paused).length), 0);
  await calm.close();
  // Default motion: the first chapter preview plays muted.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${origin}/`);
  await page.waitForFunction(() => { const video = document.querySelector('.chapter video.loop'); return video && !video.paused && video.currentTime > 0.1; }, null, { timeout: 15000 });
  note('reduced motion respected, previews loop otherwise');

  assert.deepEqual(errors, []);
  console.log(`Gallery passed (${origin}): ${checks.join('; ')}.`);
} finally {
  await browser.close();
  await local?.close();
}
