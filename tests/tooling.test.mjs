import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, validateMotion, frameTimes, resolveAsset, startServer, prepareOutput } from '../scripts/render.mjs';
import { validateFrontmatter, localReferences, extractMotion, check } from '../scripts/check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const motion = { width: 1280, height: 720, duration: 2, fps: 24 };
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(root, '.test-tooling-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test('CLI accepts storyboard default, video and help without loading Playwright', () => {
  assert.deepEqual(parseArgs(['scene.html', '--out', 'renders/demo']), { input: 'scene.html', out: 'renders/demo', video: false });
  assert.equal(parseArgs(['--video', '--out', 'renders/demo', 'scene.html']).video, true);
  assert.deepEqual(parseArgs(['--help']), { help: true });
  for (const args of [[], ['scene.html'], ['scene.html', '--out'], ['scene.html', '--out', '--video'], ['scene.txt', '--out', 'out'], ['scene.html', '--out', 'out', '--bad'], ['scene.html', '--out', 'out', '--video', '--video'], ['scene.html', '--out', 'out', '--out', 'again'], ['scene.html', 'another.html', '--out', 'out']]) assert.throws(() => parseArgs(args));
});

test('renderer navigation explicitly enables composition render mode (source contract)', async () => {
  // Guard the navigation boundary without launching Chromium in the unit suite.
  // Preview RAF loops must not run alongside explicit renderFrame calls.
  const source = await fs.readFile(path.join(root, 'scripts/render.mjs'), 'utf8');
  const navigation = source.match(/await page\.goto\(`([^`]+)`/);
  assert.ok(navigation, 'renderer must navigate to the composition URL');
  assert.match(navigation[1], /\?render=1(?:&|$)/, 'composition URL must opt into deterministic render mode');
});

test('metadata has bounded finite dimensions, duration and fps', () => {
  assert.deepEqual(validateMotion(motion), motion);
  for (const [key, values] of Object.entries({ width: [0, 1, 1279, 3842, NaN, Infinity, '1280'], height: [-2, 3, 4000], duration: [0, -1, 121, Infinity, NaN, '2'], fps: [0, 61, 29.97, Infinity, '24'] }))
    for (const value of values) assert.throws(() => validateMotion({ ...motion, [key]: value }), `${key}: ${value}`);
  assert.throws(() => validateMotion(null));
  assert.throws(() => validateMotion({}));
});

test('frame times are deterministic, finite, aligned and exclude duration endpoint', () => {
  assert.deepEqual(frameTimes(motion, true), [0, 12 / 24, 24 / 24, 35 / 24, 47 / 24]);
  assert.equal(frameTimes(motion).length, 48);
  assert.equal(frameTimes({ ...motion, duration: 0.14, fps: 50 }).length, 7);
  assert.deepEqual(frameTimes({ ...motion, duration: 0.001 }, true), [0, 0, 0, 0, 0]);
  for (const duration of [0.001, 1.01, 120]) {
    const times = frameTimes({ ...motion, duration });
    assert.ok(times.every(time => Number.isFinite(time) && time >= 0 && time < duration));
  }
});

test('asset resolver rejects traversal, malformed encoding and escaping symlinks', async t => {
  const directory = await fixture(t);
  const assets = path.join(directory, 'assets');
  await fs.mkdir(assets);
  await fs.writeFile(path.join(assets, 'index.html'), 'hello');
  await fs.writeFile(path.join(directory, 'outside'), 'private');
  await fs.symlink('../outside', path.join(assets, 'escape'));
  assert.equal(await resolveAsset(assets, '/index.html?x=1'), path.join(assets, 'index.html'));
  for (const value of ['/../outside', '/%2e%2e/outside', '/%2e%2e%2foutside', '/%00', '/bad%ZZ', '/..\\outside', '/escape', '/', 'index.html'])
    await assert.rejects(resolveAsset(assets, value), value);
});

test('static server is loopback-only and serves local assets', async t => {
  const directory = await fixture(t);
  await fs.writeFile(path.join(directory, 'index.html'), '<p>hello</p>');
  const server = await startServer(directory);
  try {
    assert.match(server.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    const response = await fetch(`${server.origin}/index.html`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '<p>hello</p>');
    assert.equal((await fetch(`${server.origin}/missing`)).status, 404);
    assert.equal((await fetch(`${server.origin}/index.html`, { method: 'POST' })).status, 405);
  } finally { await server.close(); }
});

test('output refuses nonempty directories and concurrent claims', async t => {
  const directory = await fixture(t);
  const output = path.join(directory, 'output');
  const unlock = await prepareOutput(output);
  await assert.rejects(prepareOutput(output), /nonempty/);
  await unlock();
  await fs.writeFile(path.join(output, 'keep.txt'), 'keep');
  await assert.rejects(prepareOutput(output), /nonempty/);
  assert.equal(await fs.readFile(path.join(output, 'keep.txt'), 'utf8'), 'keep');
});

test('skill frontmatter and local references are checked without YAML execution', () => {
  assert.deepEqual(validateFrontmatter('---\nname: x-motion\ndescription: Motion craft\n---\n'), { name: 'x-motion', description: 'Motion craft' });
  for (const value of ['missing', '---\nname: x-motion\n---\n', '---\nname: Bad Name\ndescription: valid\n---\n', '---\nname: x-motion\ndescription: ""\n---\n']) assert.throws(() => validateFrontmatter(value));
  assert.deepEqual(localReferences('[A](references/a.md) [A](references/a.md#anchor) [web](https://example.org) [anchor](#intro)'), ['references/a.md']);
  for (const link of ['../private', '%2e%2e/private', '/etc/passwd', 'file:secret', 'bad%ZZ', 'a\\b']) assert.throws(() => localReferences(`[bad](${link})`));
});

test('static metadata extraction rejects JavaScript expressions instead of executing them', () => {
  assert.deepEqual(extractMotion('window.motion = { width: 1280, height: 720, duration: 2, fps: 24 };'), motion);
  for (const html of ['window.motion = foo()', 'window.motion = { width: alert(1) }', 'window.motion = {width:1280,width:720,height:720,duration:2,fps:24}']) assert.throws(() => extractMotion(html));
});

test('repository checker validates references, examples, brief and metadata consistency', async t => {
  const directory = await fixture(t);
  const skill = path.join(directory, 'skills/x-motion');
  const example = path.join(directory, 'examples/demo');
  await fs.mkdir(path.join(skill, 'references'), { recursive: true });
  await fs.mkdir(example, { recursive: true });
  await fs.writeFile(path.join(skill, 'SKILL.md'), '---\nname: x-motion\ndescription: Motion craft\n---\n[Guide](references/guide.md)');
  await fs.writeFile(path.join(skill, 'references/guide.md'), 'Guide');
  await fs.writeFile(path.join(example, 'index.html'), `window.motion = ${JSON.stringify(motion)}; window.renderFrame = () => {};`);
  await fs.writeFile(path.join(example, 'brief.md'), '# A deliberate visual thesis');
  assert.equal((await check(directory)).examples.length, 1);
  await fs.writeFile(path.join(example, 'metadata.json'), JSON.stringify({ ...motion, fps: 30 }));
  await assert.rejects(check(directory), /disagree/);
  await fs.unlink(path.join(example, 'metadata.json'));
  await fs.unlink(path.join(example, 'brief.md'));
  await assert.rejects(check(directory), /brief/);
});
