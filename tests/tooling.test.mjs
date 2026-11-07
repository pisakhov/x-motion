import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, validateMotion, frameTimes, resolveAsset, servedPage, startServer, prepareOutput, wavFile, parseLoudness } from '../scripts/render.mjs';
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

test('CLI accepts audio export and bounded explicit storyboard times', () => {
  assert.deepEqual(parseArgs(['a.html', '--out', 'o', '--audio', '--times', '0,1.5,2.25']), { video: false, input: 'a.html', out: 'o', audio: true, times: [0, 1.5, 2.25] });
  for (const times of ['', '1,,2', '-1', 'a', '1e3', Array.from({ length: 61 }, (_, i) => i).join(',')]) assert.throws(() => parseArgs(['a.html', '--out', 'o', '--times', times]), times);
  assert.throws(() => parseArgs(['a.html', '--out', 'o', '--audio', '--audio']));
});

test('--root serves a parent directory and must contain the composition', async t => {
  assert.equal(parseArgs(['a/b.html', '--out', 'o', '--root', 'a']).root, 'a');
  for (const args of [['a.html', '--out', 'o', '--root'], ['a.html', '--out', 'o', '--root', '--video'], ['a.html', '--out', 'o', '--root', 'x', '--root', 'y']]) assert.throws(() => parseArgs(args));
  const directory = await fixture(t);
  await fs.mkdir(path.join(directory, 'films', 'a film'), { recursive: true });
  await fs.mkdir(path.join(directory, 'elsewhere'));
  const page = path.join(directory, 'films', 'a film', 'one#1.html');
  await fs.writeFile(page, '<!doctype html>');
  const real = await fs.realpath(directory);
  assert.deepEqual(await servedPage(page), { input: path.join(real, 'films', 'a film', 'one#1.html'), root: path.join(real, 'films', 'a film'), pagePath: 'one%231.html' });
  assert.equal((await servedPage(page, path.join(directory, 'films'))).pagePath, 'a%20film/one%231.html');
  await assert.rejects(servedPage(page, path.join(directory, 'elsewhere')), /inside --root/);
  await assert.rejects(servedPage(page, page), /directory/);
  await assert.rejects(servedPage(path.join(directory, 'films')), /must be a file/);
});

test('static server types narration and caption assets', async t => {
  const directory = await fixture(t);
  await fs.writeFile(path.join(directory, 'v.flac'), 'fLaC');
  await fs.writeFile(path.join(directory, 'c.vtt'), 'WEBVTT\n');
  const server = await startServer(directory);
  try {
    assert.equal((await fetch(`${server.origin}/v.flac`)).headers.get('content-type'), 'audio/flac');
    assert.equal((await fetch(`${server.origin}/c.vtt`)).headers.get('content-type'), 'text/vtt');
  } finally { await server.close(); }
});

test('poster time is optional and must fall inside the film', () => {
  assert.deepEqual(validateMotion({ ...motion, poster: 1.25 }), { ...motion, poster: 1.25 });
  for (const poster of [-0.1, 2, NaN, '1']) assert.throws(() => validateMotion({ ...motion, poster }), String(poster));
});

test('WAV writer emits a canonical 16-bit PCM header', () => {
  const pcm = Buffer.alloc(8);
  pcm.writeInt16LE(32767, 0); pcm.writeInt16LE(-32768, 2);
  const wav = wavFile(pcm, 2, 48000);
  assert.equal(wav.length, 52);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(4), 44);
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.readUInt32LE(24), 48000);
  assert.equal(wav.readUInt32LE(28), 192000);
  assert.equal(wav.readUInt32LE(40), 8);
  assert.deepEqual(wav.subarray(44), pcm);
  assert.throws(() => wavFile(Buffer.alloc(6), 2, 48000));
  assert.throws(() => wavFile(Buffer.alloc(8), 3, 48000));
});

test('loudness parser reads only the final ebur128 summary', () => {
  const summary = 'I: -40.0 LUFS\n[Parsed_ebur128_0] Summary:\n\n  Integrated loudness:\n    I:         -18.2 LUFS\n\n  Loudness range:\n    LRA:         3.1 LU\n\n  True peak:\n    Peak:       -2.3 dBFS\n';
  assert.deepEqual(parseLoudness(summary), { integratedLufs: -18.2, loudnessRangeLu: 3.1, truePeakDbfs: -2.3 });
  assert.deepEqual(parseLoudness('Summary:\n I:         -70.0 LUFS\n LRA: 0.0 LU\n Peak: -inf dBFS'), { integratedLufs: -70, loudnessRangeLu: 0, truePeakDbfs: null });
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
  assert.deepEqual(extractMotion('window.motion = { width: 1280, height: 720, duration: 2, fps: 24, poster: 1.5 };'), { ...motion, poster: 1.5 });
  assert.throws(() => extractMotion('window.motion = { width: 1280, height: 720, duration: 2, fps: 24, poster: 2 };'));
  for (const html of ['window.motion = foo()', 'window.motion = { width: alert(1) }', 'window.motion = {width:1280,width:720,height:720,duration:2,fps:24}']) assert.throws(() => extractMotion(html));
});

test('repository checker validates every skill, kit-based compositions and catalog sources', async t => {
  const directory = await fixture(t);
  const writeSkill = async (name, body = '') => {
    await fs.mkdir(path.join(directory, 'skills', name, 'references'), { recursive: true });
    await fs.writeFile(path.join(directory, 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: Motion craft\n---\n${body}`);
  };
  await writeSkill('x-motion', '[Guide](references/guide.md)');
  await fs.writeFile(path.join(directory, 'skills/x-motion/references/guide.md'), 'Guide');
  await writeSkill('x-motion-demo');
  await fs.mkdir(path.join(directory, 'examples/demo'), { recursive: true });
  await fs.mkdir(path.join(directory, 'data'));
  await fs.mkdir(path.join(directory, 'scripts'));
  await fs.writeFile(path.join(directory, 'scripts/site-pages.mjs'), 'export {};');
  await fs.writeFile(path.join(directory, 'examples/demo/a.html'), `window.motion = ${JSON.stringify(motion)}; window.renderFrame = () => {};`);
  await fs.writeFile(path.join(directory, 'examples/demo/kit.js'), 'window.motion = make(); window.renderFrame = t => t;');
  await fs.writeFile(path.join(directory, 'examples/demo/b.html'), '<script src="kit.js"></script>');
  await fs.mkdir(path.join(directory, 'examples/shared'));
  await fs.writeFile(path.join(directory, 'examples/shared/reel.js'), 'window.motion = make(); window.renderFrame = t => t;');
  await fs.writeFile(path.join(directory, 'examples/demo/c.html'), '<script src="../shared/reel.js"></script>');
  const catalog = record => JSON.stringify({ version: 2, themes: [{ slug: 'demo', skill: 'x-motion-demo' }], motions: [record] });
  const film = { id: 'XM-0001', status: 'review', source: 'examples/demo/a.html', skills: ['x-motion', 'x-motion-demo'], ...motion };
  await fs.writeFile(path.join(directory, 'data/catalog.json'), catalog(film));
  const result = await check(directory);
  assert.deepEqual(result.skills.map(skill => skill.name), ['x-motion', 'x-motion-demo']);
  assert.deepEqual(result.examples.map(example => [example.name, example.motion?.fps ?? null]), [['demo/a.html', 24], ['demo/b.html', null], ['demo/c.html', null]]);
  await fs.writeFile(path.join(directory, 'data/catalog.json'), catalog({ ...film, duration: 3 }));
  await assert.rejects(check(directory), /duration disagrees/);
  await fs.writeFile(path.join(directory, 'data/catalog.json'), catalog({ ...film, source: 'examples/demo/missing.html' }));
  await assert.rejects(check(directory), /not an example composition/);
  await fs.writeFile(path.join(directory, 'data/catalog.json'), catalog({ ...film, status: 'discarded', source: 'examples/demo/missing.html' }));
  assert.equal((await check(directory)).examples.length, 3);
  await writeSkill('x-motion-demo', 'Light \u2014 shade');
  await assert.rejects(check(directory), /em dash/);
  await writeSkill('x-motion-demo');
  await fs.writeFile(path.join(directory, 'skills/x-motion-demo/SKILL.md'), '---\nname: other\ndescription: Motion craft\n---\n');
  await assert.rejects(check(directory), /frontmatter name/);
  await writeSkill('x-motion-demo');
  await fs.writeFile(path.join(directory, 'examples/demo/kit.js'), 'window.motion = make();');
  await assert.rejects(check(directory), /renderFrame/);
});
