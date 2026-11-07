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
  for(const [key,hashKey] of [['video','videoSha256'],['poster','posterSha256'],['preview','previewSha256']]){
    const response=await get(film[key]);assert.equal(response.status,200);
    assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),recorded[hashKey]);
  }
}
for(const page of ['/skills/',...expected.themes.map(theme=>`/${theme.slug}/`),...expected.motions.map(film=>`/m/${film.id}/`)]){
  const response=await get(page);assert.equal(response.status,200,page);assert.match(response.headers.get('content-type'),/^text\/html/);assert.equal(response.headers.get('cache-control'),'no-cache',page);
}
for(const name of new Set(expected.themes.map(theme=>theme.skill).concat(expected.motions.flatMap(film=>film.skills)))){
  const response=await get(`/skills/${name}/SKILL.md`);assert.equal(response.status,200,name);assert.equal(response.headers.get('content-type'),'text/markdown; charset=utf-8');
  assert.equal(await response.text(),await readFile(new URL(`../skills/${name}/SKILL.md`,import.meta.url),'utf8'));
  assert.equal((await get(`/skills/${name}/`)).status,200);
}
const redirect=await fetch(`${origin}/${expected.themes[0].slug}`,{redirect:'manual',signal:AbortSignal.timeout(20000)});
assert.equal(redirect.status,301);assert.equal(redirect.headers.get('location'),`/${expected.themes[0].slug}/`,'Directory redirects must stay relative to the public host');
const missingPage=await get('/no-such-page/');assert.match(await missingPage.text(),/Nothing here\./);
for(const file of ['/media/XM-999999999.mp4','/data/catalog.json','/package.json','/unknown','/skills/x-motion/missing.md','/m/XM-0001/']){
  const response=await get(file);assert.equal(response.status,404,file);assert.equal(response.headers.get('cache-control'),'no-store',`Do not cache missing resources: ${file}`);
}
console.log(`HTTP passed: health, security/cache headers, catalog, ${expected.motions.length} films with video/poster/preview digests, byte ranges, theme and film pages, raw Markdown skills, relative redirects, noncached 404 page (${origin}).`);
