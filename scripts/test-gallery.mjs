#!/usr/bin/env node
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {startServer} from './render.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const local=process.env.GALLERY_URL ? null : await startServer(path.join(root,'dist'));
const origin=process.env.GALLERY_URL || local.origin;
const home=`${origin}/index.html`;
const browser=await chromium.launch({headless:true});
const artifacts=path.join(root,'.artifacts/gallery');await mkdir(artifacts,{recursive:true});
try {
  const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2,permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(home);
  const catalog=JSON.parse(await readFile(path.join(root,'dist/catalog.json'),'utf8'));
  const live=await (await page.request.get(`${origin}/catalog.json`)).json();assert.deepEqual(live,catalog);
  assert.equal('feedback' in live,false);
  if(!catalog.motions.length){
    await page.getByText('The collection is quiet for now.',{exact:false}).waitFor();
    assert.equal(await page.locator('#gallery').isVisible(),false);assert.deepEqual(errors,[]);
    console.log(`Gallery passed: empty collection (${origin}).`);
  } else {
  await page.locator('#gallery').waitFor({state:'visible'});
  assert.equal(await page.locator('.film-card').count(),catalog.motions.length);
  assert.equal(await page.locator('#player').evaluate(v=>v.paused),true);
  await page.screenshot({path:path.join(artifacts,'desktop.png'),fullPage:true});
  for(const film of catalog.motions){
    await page.locator('.film-card').filter({hasText:film.id}).click();
    assert.equal(await page.locator('#feature-id').innerText(),film.id);
    assert.equal(new URL(page.url()).hash,`#${film.id}`);
    await page.waitForFunction(()=>document.querySelector('#player').readyState>=2);
    const details=await page.locator('#player').evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight,paused:v.paused}));
    assert.equal(details.width,film.width);assert.equal(details.height,film.height);assert.ok(Math.abs(details.duration-film.duration)<.1);assert.equal(details.paused,true);
    await page.locator('#player').evaluate(async v=>{v.muted=true;await v.play()});
    await page.waitForFunction(()=>document.querySelector('#player').currentTime>.15);
    await page.locator('#player').evaluate(v=>v.pause());
    await page.locator('#copy-id').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),film.id);
    await page.locator('#copy-feedback').click();assert.ok((await page.evaluate(()=>navigator.clipboard.readText())).includes(`Motion: ${film.id}`));
  }
  if(catalog.motions.length>1){await page.goBack();assert.equal(await page.locator('#feature-id').innerText(),catalog.motions.at(-2).id);}
  await page.goto(`${home}#${catalog.motions.at(-1).id}`);await page.locator('#gallery').waitFor({state:'visible'});assert.equal(await page.locator('#feature-id').innerText(),catalog.motions.at(-1).id);
  await page.locator('[data-filter="kept"]').click();assert.equal(await page.locator('.film-card').count(),catalog.motions.filter(m=>m.status==='kept').length);
  await page.locator('[data-filter="all"]').click();
  await page.goto(`${home}#XM-999999`);await page.locator('#selection-notice').waitFor({state:'visible'});
  for(const width of [360,390,768,1280]){
    await page.setViewportSize({width,height:900});await page.goto(home);await page.locator('#gallery').waitFor({state:'visible'});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}`);
    const tiny=await page.locator('button:visible').evaluateAll(items=>items.filter(b=>{const r=b.getBoundingClientRect();return r.height<44||r.width<44}).map(b=>b.textContent));assert.deepEqual(tiny,[]);
    await page.screenshot({path:path.join(artifacts,`viewport-${width}.png`),fullPage:true});
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.locator('#gallery').waitFor({state:'visible'});assert.equal(await page.locator('#player').evaluate(v=>v.paused),true);
  await page.route('**/catalog.json',r=>r.fulfill({json:{version:1,motions:[]}}));await page.reload();await page.getByText('The collection is quiet for now.',{exact:false}).waitFor();assert.equal(await page.locator('#gallery').isVisible(),false);
  await page.unroute('**/catalog.json');await page.route('**/catalog.json',r=>r.fulfill({status:503,body:'unavailable'}));await page.reload();await page.getByRole('button',{name:'Try again'}).waitFor();
  await page.unroute('**/catalog.json');await page.getByRole('button',{name:'Try again'}).click();await page.locator('#gallery').waitFor({state:'visible'});
  assert.deepEqual(errors,[]);console.log(`Gallery passed: ${catalog.motions.length} videos, playback, IDs, copy, deep links, filters, reduced motion, failure/empty states, four viewport widths (${origin}).`);
  }
} finally {await browser.close();await local?.close();}
