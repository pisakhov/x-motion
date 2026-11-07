import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { addMotion, main, vttTranscript, readCatalog, recordFeedback, sha256File, validateCatalog, validateMedia } from '../scripts/catalog.mjs';
import { buildSite } from '../scripts/build-site.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = value => createHash('sha256').update(value).digest('hex');
const THEMES = [{ slug: 'demo', title: 'Demo', tagline: 'A quiet test theme.', skill: 'x-motion-demo' }];
const motion = (id = 'XM-0001', extra = {}) => ({
  id, title: 'First light', description: 'A motion study', status: 'review',
  duration: 6, width: 960, height: 540,
  video: `/media/${id}.mp4`, poster: `/media/${id}.webp`, preview: `/media/${id}-preview.mp4`, parentId: null,
  videoSha256: digest(`fixture bytes ${id}.mp4`), posterSha256: digest(`fixture bytes ${id}.webp`), previewSha256: digest(`fixture bytes ${id}-preview.mp4`),
  createdAt: '2026-11-06', source: 'examples/demo/a.html', hasAudio: true,
  theme: 'demo', slug: `film-${id.slice(3)}`, prompt: 'A drop of light. 6 seconds.', skills: ['x-motion', 'x-motion-demo'], model: 'claude-opus-5-5',
  ...extra,
});
const catalogOf = (motions, extra = {}) => ({ version: 2, themes: THEMES, motions, ...extra });
async function fixture(t, motions = [motion()]) {
  const root = await mkdtemp(path.join(ROOT, '.catalog-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['data', 'site/fonts', 'gallery-media', 'examples/demo', 'skills/x-motion/references', 'skills/x-motion-demo']) await mkdir(path.join(root, dir), { recursive: true });
  await writeFile(path.join(root, 'data/catalog.json'), JSON.stringify(catalogOf(motions)));
  await writeFile(path.join(root, 'data/feedback.json'), '{"private":"NEVER COPY THIS"}');
  for (const name of ['app.js', 'style.css', 'fonts/geist.woff2', 'fonts/geist-mono.woff2', 'fonts/OFL.txt']) await writeFile(path.join(root, 'site', name), `fixture ${name}`);
  await writeFile(path.join(root, 'skills/x-motion/SKILL.md'), '---\nname: x-motion\ndescription: Core craft.\n---\n# Core\n\nRead [Guide](references/guide.md) and [the renderer](../../scripts/render.mjs).\n');
  await writeFile(path.join(root, 'skills/x-motion/references/guide.md'), '# Guide\n\n## Beats\n\nPlan <script>beats</script>.\n');
  await writeFile(path.join(root, 'skills/x-motion-demo/SKILL.md'), '---\nname: x-motion-demo\ndescription: Demo theme.\n---\n# Demo\n');
  await writeFile(path.join(root, 'examples/demo/a.html'), 'window.renderFrame = () => {};');
  for (const item of motions) {
    for (const suffix of ['.mp4', '.webp', '-preview.mp4']) await writeFile(path.join(root, 'gallery-media', `${item.id}${suffix}`), `fixture bytes ${item.id}${suffix}`);
  }
  return root;
}

test('catalog validation accepts revisions, rejects duplicate IDs, cycles and missing parents', () => {
  assert.doesNotThrow(() => validateCatalog(catalogOf([motion(), motion('XM-0002', { parentId: 'XM-0001' })])));
  assert.doesNotThrow(() => validateCatalog(catalogOf([motion('XM-0001', { theme: null, status: 'discarded' })])));
  for (const motions of [
    [motion(), motion()],
    [motion('XM-0001', { parentId: 'XM-0001' })],
    [motion('XM-0001', { parentId: 'XM-0002' }), motion('XM-0002', { parentId: 'XM-0001' })],
    [motion('XM-0001', { parentId: 'XM-9999' })],
  ]) assert.throws(() => validateCatalog(catalogOf(motions)));
});

test('catalog rejects unsafe paths and invalid metadata', () => {
  for (const change of [
    { id: '../escape' }, { id: 'XM-0000' }, { status: 'approved' },
    { duration: 0 }, { duration: Infinity }, { duration: 3601 },
    { width: 0 }, { width: 8193 }, { height: 1.5 },
    { title: ' ' }, { description: '' }, { createdAt: '2026-02-30' },
    { source: '../secret.html' }, { source: 'examples/../private.html' },
    { video: '/media/XM-0002.mp4' }, { poster: 'https://example.org/poster.webp' },
    { hasAudio: 'true' }, { parentId: undefined },
    { videoSha256: undefined }, { posterSha256: '' }, { videoSha256: 'a'.repeat(63) },
    { posterSha256: 'A'.repeat(64) }, { videoSha256: 'g'.repeat(64) },
    { theme: null }, { theme: 'missing' }, { slug: 'Bad Slug' }, { prompt: ' ' }, { model: '' },
    { skills: [] }, { skills: ['x-motion', 'x-motion'] }, { skills: ['Bad'] }, { skills: Array.from({ length: 9 }, (_, i) => `s${i}`) },
    { preview: '/media/XM-0002-preview.mp4' }, { previewSha256: undefined },
  ]) assert.throws(() => validateCatalog(catalogOf([motion('XM-0001', change)])), JSON.stringify(change));
  assert.throws(() => validateCatalog(catalogOf([motion(), motion('XM-0002', { slug: 'film-0001' })])), /duplicate slug/);
  assert.throws(() => validateCatalog({ version: 1, motions: [] }));
  assert.throws(() => validateCatalog({ version: 2, motions: [] }));
  for (const theme of [{ ...THEMES[0], slug: 'skills' }, { ...THEMES[0], slug: 'm' }, { ...THEMES[0], tagline: '' }, { ...THEMES[0], skill: 'Bad Skill' }])
    assert.throws(() => validateCatalog({ version: 2, themes: [theme], motions: [] }), JSON.stringify(theme));
  assert.throws(() => validateCatalog(catalogOf([], { feedback: {} })));
  assert.throws(() => validateCatalog(catalogOf([], { feedback: [{ id: 'XM-9999' }] })));
});

test('feedback preserves exact note, identity, source, assets and prior events', async t => {
  const root = await fixture(t);
  const original = (await readCatalog(root)).motions[0];
  const video = await readFile(path.join(root, 'gallery-media/XM-0001.mp4'));
  const note = '  Exact user feedback\n“Keep the pause”; don\'t change the title.  ';
  const event = await recordFeedback(root, 'XM-0001', 'improve', note);
  assert.equal(event.note, note);
  assert.equal(event.previousStatus, 'review');
  assert.equal(event.status, 'improve');
  assert.equal(new Date(event.timestamp).toISOString(), event.timestamp);
  await recordFeedback(root, 'XM-0001', 'kept', 'Yes, keep it.');
  const updated = await readCatalog(root);
  assert.deepEqual(updated.motions[0], { ...original, status: 'kept' });
  assert.deepEqual(updated.feedback[0], event);
  assert.equal(updated.feedback[1].previousStatus, 'improve');
  assert.deepEqual(await readFile(path.join(root, 'gallery-media/XM-0001.mp4')), video);
  assert.deepEqual(await readdir(path.join(root, 'data')), ['catalog.json', 'feedback.json']);
});

test('invalid feedback and invalid catalog fail without changing authoritative bytes', async t => {
  const root = await fixture(t);
  const filename = path.join(root, 'data/catalog.json');
  const original = await readFile(filename, 'utf8');
  for (const args of [
    ['XM-9999', 'kept', 'Keep'], ['../evil', 'kept', 'Keep'],
    ['XM-0001', 'approved', 'Keep'], ['XM-0001', 'kept', ' \n '],
  ]) {
    await assert.rejects(recordFeedback(root, ...args));
    assert.equal(await readFile(filename, 'utf8'), original);
  }
  await writeFile(filename, '{broken');
  await assert.rejects(recordFeedback(root, 'XM-0001', 'kept', 'Keep'));
  assert.equal(await readFile(filename, 'utf8'), '{broken');
  assert.deepEqual(await readdir(path.join(root, 'data')), ['catalog.json', 'feedback.json']);
});

test('existing writer lock fails closed and is not removed by another writer', async t => {
  const root = await fixture(t);
  const filename = path.join(root, 'data/catalog.json');
  const original = await readFile(filename, 'utf8');
  await writeFile(`${filename}.lock`, 'existing lock');
  await assert.rejects(recordFeedback(root, 'XM-0001', 'kept', 'Keep'), { code: 'EEXIST' });
  assert.equal(await readFile(filename, 'utf8'), original);
  assert.equal(await readFile(`${filename}.lock`, 'utf8'), 'existing lock');
});

test('CLI rejects missing, duplicate and unknown options without mutation', async t => {
  const root = await fixture(t);
  for (const flags of [
    ['--status', 'kept'], ['--status', 'kept', '--status', 'discarded'],
    ['--status', 'kept', '--unknown', 'note'],
  ]) await assert.rejects(main(['feedback', 'XM-0001', ...flags], root));
  assert.equal((await readCatalog(root)).motions[0].status, 'review');
});

test('media validation rejects empty, oversized and symlinked assets', async t => {
  const root = await fixture(t);
  const filename = path.join(root, 'gallery-media/XM-0001.mp4');
  await validateMedia(root, [motion()]);
  await writeFile(filename, '');
  await assert.rejects(validateMedia(root, [motion()]), /size limit/);
  await truncate(filename, 250 * 1024 * 1024 + 1);
  await assert.rejects(validateMedia(root, [motion()]), /size limit/);
  await rm(filename);
  await symlink(path.join(root, 'gallery-media/XM-0001.webp'), filename);
  await assert.rejects(validateMedia(root, [motion()]), /regular file/);
});

test('build includes only public metadata and non-discarded media; rebuild removes stale media', async t => {
  const root = await fixture(t, [motion(), motion('XM-0002', { status: 'kept', parentId: 'XM-0001' })]);
  await recordFeedback(root, 'XM-0001', 'improve', 'SECRET FEEDBACK DO NOT SHIP');
  await buildSite(root);
  assert.equal((await readdir(path.join(root, 'dist/media'))).length, 6);
  await recordFeedback(root, 'XM-0001', 'discarded', 'SECRET SECOND NOTE');
  await buildSite(root);
  const published = JSON.parse(await readFile(path.join(root, 'dist/catalog.json'), 'utf8'));
  assert.deepEqual(published.motions.map(item => item.id), ['XM-0002']);
  assert.equal(published.motions[0].parentId, 'XM-0001');
  assert.equal(published.feedback, undefined);
  assert.equal(published.motions[0].source, 'examples/demo/a.html');
  assert.equal(published.motions[0].videoSha256, undefined);
  assert.equal(published.motions[0].posterSha256, undefined);
  assert.equal(published.motions[0].prompt, 'A drop of light. 6 seconds.');
  assert.deepEqual(published.themes, THEMES);
  assert.deepEqual(await readdir(path.join(root, 'dist/media')), ['XM-0002-preview.mp4', 'XM-0002.mp4', 'XM-0002.webp']);
  assert.deepEqual((await readdir(path.join(root, 'dist'))).sort(), ['.x-motion-build.json', '404.html', 'app.js', 'catalog.json', 'demo', 'fonts', 'index.html', 'm', 'media', 'skills', 'style.css']);
  assert.deepEqual(await readdir(path.join(root, 'dist/m')), ['XM-0002']);
  assert.equal((await readCatalog(root)).motions.length, 2);
  assert.equal((await readdir(path.join(root, 'gallery-media'))).length, 6);
  assert.equal((await readFile(path.join(root, 'dist/catalog.json'), 'utf8')).includes('SECRET'), false);
});

test('failed rebuild preserves the old output and leaves no build staging files', async t => {
  const root = await fixture(t);
  await buildSite(root);
  const original = await readFile(path.join(root, 'dist/catalog.json'), 'utf8');
  await rm(path.join(root, 'gallery-media/XM-0001.mp4'));
  await assert.rejects(buildSite(root));
  assert.equal(await readFile(path.join(root, 'dist/catalog.json'), 'utf8'), original);
  assert.equal((await readdir(root)).some(name => name.startsWith('.site-') || name === '.build-site.lock'), false);
});

test('digest mismatches fail rebuild without replacing output or changing catalog', async t => {
  const root = await fixture(t);
  await buildSite(root);
  const original = await readFile(path.join(root, 'dist/catalog.json'), 'utf8');
  const source = await readFile(path.join(root, 'data/catalog.json'), 'utf8');
  for (const suffix of ['.mp4', '.webp', '-preview.mp4']) {
    const filename = path.join(root, `gallery-media/XM-0001${suffix}`);
    await writeFile(filename, 'changed bytes under a permanent ID');
    await assert.rejects(buildSite(root), /SHA-256 mismatch/);
    assert.equal(await readFile(path.join(root, 'dist/catalog.json'), 'utf8'), original);
    assert.equal(await readFile(path.join(root, 'data/catalog.json'), 'utf8'), source);
    await writeFile(filename, `fixture bytes XM-0001${suffix}`);
  }
});

test('build checks active digests; full validator also checks discarded media', async t => {
  const root = await fixture(t, [motion(), motion('XM-0002', { status: 'discarded' })]);
  await writeFile(path.join(root, 'gallery-media/XM-0002.mp4'), 'tampered discarded asset');
  assert.equal((await buildSite(root)).count, 1);
  await assert.rejects(validateMedia(root, (await readCatalog(root)).motions), /SHA-256 mismatch/);
});

test('build refuses arbitrary paths, unmanaged outputs and output symlinks', async t => {
  const root = await fixture(t);
  for (const out of ['.', '..', '/', '../dist', 'site', 'data', '/tmp/dist']) await assert.rejects(buildSite(root, out), /--out/);
  await mkdir(path.join(root, 'dist'));
  await writeFile(path.join(root, 'dist/precious.txt'), 'keep');
  await assert.rejects(buildSite(root));
  assert.equal(await readFile(path.join(root, 'dist/precious.txt'), 'utf8'), 'keep');
  await symlink(path.join(root, 'site'), path.join(root, 'dist-link'));
  await assert.rejects(buildSite(root, 'dist-link'), /real generated directory/);
  assert.equal((await buildSite(root, 'dist-preview')).count, 1);
});

test('build publishes themed pages, film pages and raw plus rendered skills', async t => {
  const root = await fixture(t, [motion(), motion('XM-0002', { title: 'Second <b>', slug: 'second' })]);
  await buildSite(root);
  const read = file => readFile(path.join(root, 'dist', file), 'utf8');
  const home = await read('index.html');
  assert.match(home, /href="\/demo\/"/);
  assert.match(home, /2 films/);
  const theme = await read('demo/index.html');
  assert.match(theme, /href="\/m\/XM-0001\/"/);
  assert.match(theme, /href="\/skills\/x-motion-demo\/"/);
  const film = await read('m/XM-0002/index.html');
  assert.match(film, /Second &lt;b&gt;/);
  assert.match(film, /<p id="prompt" class="prompt">A drop of light\. 6 seconds\.<\/p>/);
  assert.match(film, /href="\/skills\/x-motion\/"/);
  assert.match(film, /Claude Opus 5\.5/);
  assert.match(film, /data-key="ArrowLeft"/);
  assert.equal(await read('skills/x-motion/SKILL.md'), await readFile(path.join(root, 'skills/x-motion/SKILL.md'), 'utf8'));
  const skill = await read('skills/x-motion/index.html');
  assert.match(skill, /data-copy-url="\/skills\/x-motion\/SKILL\.md"/);
  assert.match(skill, /href="\/skills\/x-motion\/references\/guide\/"/);
  assert.match(skill, /href="https:\/\/github\.com\/pisakhov\/x-motion\/blob\/main\/scripts\/render\.mjs"/);
  assert.match(skill, /Used in 2 films/);
  const guide = await read('skills/x-motion/references/guide/index.html');
  assert.match(guide, /&lt;script&gt;beats&lt;\/script&gt;/);
  assert.equal(guide.includes('<script>beats'), false);
  assert.match(await read('skills/index.html'), /x-motion-demo/);
  assert.match(await read('404.html'), /Nothing here/);
  for (const file of ['index.html', 'demo/index.html', 'm/XM-0001/index.html', 'skills/x-motion/index.html']) assert.equal((await read(file)).includes('\u2014'), false, file);
});

test('build refuses themes or films that name a missing skill', async t => {
  const root = await fixture(t, [motion('XM-0001', { skills: ['x-motion', 'x-motion-missing'] })]);
  await assert.rejects(buildSite(root), /missing skill/);
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
test('add publishes a verified render under the next ID without overwriting media', { skip: !hasFfmpeg && 'ffmpeg unavailable' }, async t => {
  const root = await fixture(t);
  const render = path.join(root, 'render');
  await mkdir(render);
  const film = path.join(render, 'film.mp4'), poster = path.join(render, 'poster.webp');
  assert.equal(spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=1:r=30', '-pix_fmt', 'yuv420p', film]).status, 0);
  await writeFile(poster, 'poster bytes');
  const manifest = { mode: 'video', composition: 'a.html', determinismCheck: { passed: true }, audio: null, motion: { width: 320, height: 180, duration: 1, fps: 30 },
    files: [{ file: 'film.mp4', sha256: await sha256File(film) }, { file: 'poster.webp', sha256: await sha256File(poster) }] };
  await writeFile(path.join(render, 'manifest.json'), JSON.stringify(manifest));
  const spec = { source: 'examples/demo/a.html', theme: 'demo', slug: 'new-film', title: 'New film', description: 'A new film.', prompt: 'Make it.', skills: ['x-motion', 'x-motion-demo'], model: 'claude-opus-5-5' };
  const record = await addMotion(root, render, spec, '2026-11-07');
  assert.equal(record.id, 'XM-0002');
  assert.equal(record.hasAudio, false);
  assert.equal(record.status, 'review');
  assert.equal(record.previewSha256, await sha256File(path.join(root, 'gallery-media/XM-0002-preview.mp4')));
  assert.equal((await readCatalog(root)).motions.at(-1).slug, 'new-film');
  const before = await readFile(path.join(root, 'data/catalog.json'), 'utf8');
  await assert.rejects(addMotion(root, render, spec), /duplicate slug/);
  await assert.rejects(addMotion(root, render, { ...spec, slug: 'other', source: 'examples/demo/b.html' }), /composition does not match/);
  await assert.rejects(addMotion(root, render, { ...spec, slug: 'other', extra: true }), /Unknown spec field/);
  await writeFile(poster, 'tampered');
  await assert.rejects(addMotion(root, render, { ...spec, slug: 'other' }), /does not match the render manifest/);
  assert.equal(await readFile(path.join(root, 'data/catalog.json'), 'utf8'), before);
  assert.deepEqual((await readdir(path.join(root, 'gallery-media'))).sort(), ['XM-0001-preview.mp4', 'XM-0001.mp4', 'XM-0001.webp', 'XM-0002-preview.mp4', 'XM-0002.mp4', 'XM-0002.webp']);
});

const VTT = 'WEBVTT\n\n1\n00:00:00.500 --> 00:00:02.000\nEvery orbit begins\nwith a door.\n\n2\n00:00:02.400 --> 00:00:04.000\nOne orbit. <i>Then</i> another.\n';
test('captions validate with the film ID, digest and transcript', () => {
  const narrated = motion('XM-0001', { captions: '/media/XM-0001.vtt', captionsSha256: digest(VTT), transcript: ['Every orbit begins with a door.'] });
  assert.doesNotThrow(() => validateCatalog(catalogOf([narrated])));
  for (const change of [
    { captions: '/media/XM-0002.vtt' }, { captions: '/media/../x.vtt' }, { captionsSha256: 'abc' }, { captionsSha256: undefined },
    { transcript: [] }, { transcript: [' padded '] }, { transcript: 'text' }, { transcript: undefined },
  ]) assert.throws(() => validateCatalog(catalogOf([{ ...narrated, ...change }])), JSON.stringify(change));
  assert.throws(() => validateCatalog(catalogOf([motion('XM-0001', { transcript: ['Orphan line.'] })])), /need captions/);
  assert.deepEqual(vttTranscript(VTT), ['Every orbit begins with a door.', 'One orbit. Then another.']);
  for (const bad of ['', 'WEBVTTX\n\n', '<b>not vtt</b>', 'WEBVTT\n\nNOTE only a note\n']) assert.throws(() => vttTranscript(bad), JSON.stringify(bad));
});

test('add copies captions beside the film and the page carries a track and transcript', { skip: !hasFfmpeg && 'ffmpeg unavailable' }, async t => {
  const root = await fixture(t);
  const render = path.join(root, 'render');
  await mkdir(render);
  const film = path.join(render, 'film.mp4'), poster = path.join(render, 'poster.webp');
  assert.equal(spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=1:r=30', '-pix_fmt', 'yuv420p', film]).status, 0);
  await writeFile(poster, 'poster bytes');
  await writeFile(path.join(render, 'manifest.json'), JSON.stringify({ mode: 'video', composition: 'a.html', determinismCheck: { passed: true }, audio: { lufs: -18 }, motion: { width: 320, height: 180, duration: 1, fps: 30 },
    files: [{ file: 'film.mp4', sha256: await sha256File(film) }, { file: 'poster.webp', sha256: await sha256File(poster) }] }));
  await writeFile(path.join(root, 'examples/demo/a.vtt'), VTT);
  const spec = { source: 'examples/demo/a.html', theme: 'demo', slug: 'narrated', title: 'Narrated', description: 'With a voice.', prompt: 'Speak.', skills: ['x-motion', 'x-motion-demo'], model: 'claude-opus-5-5' };
  for (const captions of ['../a.vtt', 'examples/demo/a.html', 'examples/demo/missing.vtt']) await assert.rejects(addMotion(root, render, { ...spec, captions }), /captions/);
  const record = await addMotion(root, render, { ...spec, captions: 'examples/demo/a.vtt' }, '2026-11-07');
  assert.equal(record.captions, '/media/XM-0002.vtt');
  assert.equal(record.captionsSha256, digest(VTT));
  assert.deepEqual(record.transcript, ['Every orbit begins with a door.', 'One orbit. Then another.']);
  await buildSite(root);
  const page = await readFile(path.join(root, 'dist/m/XM-0002/index.html'), 'utf8');
  assert.match(page, /<track kind="captions" src="\/media\/XM-0002\.vtt" srclang="en" label="English">/);
  assert.match(page, /Original score and narration/);
  assert.match(page, /<p>One orbit\. Then another\.<\/p>/);
  assert.equal(await readFile(path.join(root, 'dist/media/XM-0002.vtt'), 'utf8'), VTT);
  assert.doesNotMatch(await readFile(path.join(root, 'dist/m/XM-0001/index.html'), 'utf8'), /<track|Transcript/);
});
