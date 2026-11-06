import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { main, readCatalog, recordFeedback, validateCatalog, validateMedia } from '../scripts/catalog.mjs';
import { buildSite } from '../scripts/build-site.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = value => createHash('sha256').update(value).digest('hex');
const motion = (id = 'XM-0001', extra = {}) => ({
  id, title: 'First light', description: 'A motion study', status: 'review',
  duration: 6, width: 960, height: 540,
  video: `/media/${id}.mp4`, poster: `/media/${id}.webp`, parentId: null,
  videoSha256: digest(`fixture bytes ${id}.mp4`), posterSha256: digest(`fixture bytes ${id}.webp`),
  createdAt: '2026-11-06', source: 'examples/first-light/index.html', hasAudio: true,
  ...extra,
});
async function fixture(t, motions = [motion()]) {
  const root = await mkdtemp(path.join(ROOT, '.catalog-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['data', 'site', 'gallery-media']) await mkdir(path.join(root, dir));
  await writeFile(path.join(root, 'data/catalog.json'), JSON.stringify({ version: 1, motions }));
  await writeFile(path.join(root, 'data/feedback.json'), '{"private":"NEVER COPY THIS"}');
  for (const name of ['index.html', 'app.js', 'style.css']) await writeFile(path.join(root, 'site', name), `fixture ${name}`);
  for (const item of motions) {
    for (const extension of ['mp4', 'webp']) await writeFile(path.join(root, 'gallery-media', `${item.id}.${extension}`), `fixture bytes ${item.id}.${extension}`);
  }
  return root;
}

test('catalog validation accepts revisions, rejects duplicate IDs, cycles and missing parents', () => {
  assert.doesNotThrow(() => validateCatalog({ version: 1, motions: [motion(), motion('XM-0002', { parentId: 'XM-0001' })] }));
  for (const motions of [
    [motion(), motion()],
    [motion('XM-0001', { parentId: 'XM-0001' })],
    [motion('XM-0001', { parentId: 'XM-0002' }), motion('XM-0002', { parentId: 'XM-0001' })],
    [motion('XM-0001', { parentId: 'XM-9999' })],
  ]) assert.throws(() => validateCatalog({ version: 1, motions }));
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
  ]) assert.throws(() => validateCatalog({ version: 1, motions: [motion('XM-0001', change)] }), JSON.stringify(change));
  assert.throws(() => validateCatalog({ version: 2, motions: [] }));
  assert.throws(() => validateCatalog({ version: 1, motions: [], feedback: {} }));
  assert.throws(() => validateCatalog({ version: 1, motions: [], feedback: [{ id: 'XM-9999' }] }));
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
  assert.equal((await readdir(path.join(root, 'dist/media'))).length, 4);
  await recordFeedback(root, 'XM-0001', 'discarded', 'SECRET SECOND NOTE');
  await buildSite(root);
  const published = JSON.parse(await readFile(path.join(root, 'dist/catalog.json'), 'utf8'));
  assert.deepEqual(published.motions.map(item => item.id), ['XM-0002']);
  assert.equal(published.motions[0].parentId, 'XM-0001');
  assert.equal(published.feedback, undefined);
  assert.equal(published.motions[0].source, undefined);
  assert.equal(published.motions[0].videoSha256, undefined);
  assert.equal(published.motions[0].posterSha256, undefined);
  assert.deepEqual(await readdir(path.join(root, 'dist/media')), ['XM-0002.mp4', 'XM-0002.webp']);
  assert.deepEqual(await readdir(path.join(root, 'dist')), ['.x-motion-build.json', 'app.js', 'catalog.json', 'index.html', 'media', 'style.css']);
  assert.equal((await readCatalog(root)).motions.length, 2);
  assert.equal((await readdir(path.join(root, 'gallery-media'))).length, 4);
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
  for (const extension of ['mp4', 'webp']) {
    const filename = path.join(root, `gallery-media/XM-0001.${extension}`);
    await writeFile(filename, 'changed bytes under a permanent ID');
    await assert.rejects(buildSite(root), /SHA-256 mismatch/);
    assert.equal(await readFile(path.join(root, 'dist/catalog.json'), 'utf8'), original);
    assert.equal(await readFile(path.join(root, 'data/catalog.json'), 'utf8'), source);
    await writeFile(filename, `fixture bytes XM-0001.${extension}`);
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
