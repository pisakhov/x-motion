#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const origin=process.env.GALLERY_URL || 'http://127.0.0.1:8794';
const get=p=>fetch(`${origin}${p}`,{signal:AbortSignal.timeout(20000)});
const home=await get('/');assert.equal(home.status,200);assert.match(home.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(home.headers.get('x-content-type-options'),'nosniff');assert.equal(home.headers.get('cache-control'),'no-cache');
assert.equal((await get('/healthz')).status,200);
const expected=JSON.parse(await readFile(new URL('../dist/catalog.json',import.meta.url),'utf8'));
assert.deepEqual(await (await get('/catalog.json')).json(),expected);
const source=JSON.parse(await readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));
for(const film of expected.motions){
  const recorded=source.motions.find(m=>m.id===film.id);
  const range=await fetch(`${origin}${film.video}`,{headers:{Range:'bytes=0-31'},signal:AbortSignal.timeout(20000)});
  assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,32);assert.match(range.headers.get('cache-control'),/immutable/);assert.match(range.headers.get('content-range'),/^bytes 0-31\//);
  for(const [key,hashKey] of [['video','videoSha256'],['poster','posterSha256']]){
    const response=await get(film[key]);assert.equal(response.status,200);
    assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),recorded[hashKey]);
  }
}
for(const file of ['/media/XM-999999999.mp4','/data/catalog.json','/package.json','/unknown']){
  const response=await get(file);assert.equal(response.status,404);assert.equal(response.headers.get('cache-control'),'no-store',`Do not cache missing resources: ${file}`);
}
console.log(`HTTP passed: health, security/cache headers, catalog, ${expected.motions.length} media digests, byte ranges, noncached 404s (${origin}).`);
