import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {render} from '../scripts/render.mjs';
const skip = process.env.RUN_RENDER_TESTS !== '1';
const head = '<!doctype html><style>body{margin:0}</style><canvas width="64" height="64"></canvas><script>window.motion={width:64,height:64,duration:1,fps:5}; const c=document.querySelector("canvas").getContext("2d");';
test('browser capture enters render mode and proves backward-seek identity', {skip}, async () => {
  const dir = await mkdtemp(join(tmpdir(),'x-motion-browser-'));
  try {
    const input=join(dir,'index.html');
    await writeFile(input, head + 'if(new URLSearchParams(location.search).get("render")!=="1")throw Error("Preview mode must not run");window.renderFrame=t=>{c.fillStyle=t<.5?"#123456":"#abcdef";c.fillRect(0,0,64,64)};</script>');
    const result=await render({input,out:join(dir,'output'),video:false});
    assert.equal(result.determinismCheck.passed,true);
    assert.equal(result.files.length,5);
    assert.notEqual(result.files[0].sha256,result.files.at(-1).sha256);
    await assert.rejects(render({input,out:join(dir,'output'),video:false}),/nonempty/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('browser rejects stateful frame functions', {skip}, async () => {
  const dir=await mkdtemp(join(tmpdir(),'x-motion-state-'));
  try {
    const input=join(dir,'index.html');
    await writeFile(input,head+'let n=0;window.renderFrame=()=>{c.fillStyle=`rgb(${++n*20},0,0)`;c.fillRect(0,0,64,64)};</script>');
    await assert.rejects(render({input,out:join(dir,'output'),video:false}),/Determinism check failed/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
const tone = 'window.renderAudio=async({sampleRate})=>{const a=new OfflineAudioContext(2,sampleRate,sampleRate);const o=a.createOscillator();const g=a.createGain();g.gain.value=.2;o.frequency.value=440;o.connect(g).connect(a.destination);o.start();return a.startRendering()};';
test('video export muxes a deterministic score with poster and loudness figures', {skip}, async () => {
  const dir=await mkdtemp(join(tmpdir(),'x-motion-audio-'));
  try {
    const input=join(dir,'index.html');
    await writeFile(input,head.replace('fps:5}','fps:5,poster:.6}')+'window.renderFrame=t=>{c.fillStyle=t<.5?"#123456":"#abcdef";c.fillRect(0,0,64,64)};'+tone+'</script>');
    const result=await render({input,out:join(dir,'output'),video:true});
    assert.equal(result.audio.determinismCheck.passed,true);
    assert.equal(result.audio.sampleRate,48000);
    assert.equal(result.audio.channels,2);
    assert.equal(result.audio.frames,48000);
    assert.equal(result.audio.clippedSamples,0);
    assert.ok(result.audio.integratedLufs<-5&&result.audio.integratedLufs>-30,String(result.audio.integratedLufs));
    assert.ok(result.files.some(file=>file.file==='poster.webp'));
    assert.ok(result.files.some(file=>file.file==='sound.wav'));
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('audio export rejects a score that changes between renders', {skip}, async () => {
  const dir=await mkdtemp(join(tmpdir(),'x-motion-audio-state-'));
  try {
    const input=join(dir,'index.html');
    await writeFile(input,head+'window.renderFrame=()=>{};let f=200;'+tone.replace('o.frequency.value=440','o.frequency.value=(f+=100)')+'</script>');
    await assert.rejects(render({input,out:join(dir,'output'),video:false,audio:true}),/determinism/i);
  } finally {await rm(dir,{recursive:true,force:true});}
});
