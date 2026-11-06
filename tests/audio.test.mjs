import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
test('original sound is deterministic, bounded and never overwrites', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'x-motion-audio-'));
  try {
    const a = join(dir, 'a.wav'), b = join(dir, 'b.wav');
    for (const path of [a,b]) assert.equal(spawnSync(process.execPath, ['scripts/first-light-audio.mjs', path]).status, 0);
    const bytes = await readFile(a);
    assert.deepEqual(bytes, await readFile(b));
    assert.equal(bytes.toString('ascii',0,4), 'RIFF');
    assert.equal(bytes.readUInt32LE(24), 48000);
    assert.equal(bytes.readUInt32LE(40), 6 * 48000 * 2);
    let peak = 0;
    for (let i=44;i<bytes.length;i+=2) peak=Math.max(peak,Math.abs(bytes.readInt16LE(i)));
    assert.ok(peak >= 16420 && peak <= 16424);
    assert.notEqual(spawnSync(process.execPath, ['scripts/first-light-audio.mjs', a]).status, 0);
    assert.deepEqual(bytes, await readFile(a));
  } finally { await rm(dir, {recursive:true, force:true}); }
});
