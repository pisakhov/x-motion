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
// A reel cut from a scene that creates its 1920x1080 canvas lazily on its first renderFrame (as Prism's
// Dispersion does) must load that scene and composite its pixels rather than failing or showing black.
test('reel loads scenes whose canvas appears only after their first frame', {skip}, async () => {
  const {cp, mkdir} = await import('node:fs/promises');
  const dir=await mkdtemp(join(tmpdir(),'x-motion-reel-lazy-'));
  try {
    for (const d of ['orbit','reel','film']) await mkdir(join(dir,d));
    await cp('examples/orbit/kit.js', join(dir,'orbit/kit.js'));
    await cp('examples/reel/reel.js', join(dir,'reel/reel.js'));
    await writeFile(join(dir,'film/lazy.html'), '<!doctype html><body><script>let c=null;window.motion={width:1920,height:1080,duration:2,fps:30};window.renderFrame=t=>{if(!c){c=document.createElement("canvas");c.width=1920;c.height=1080;document.body.appendChild(c)}const x=c.getContext("2d");x.fillStyle=t<1?"#c03020":"#2050d0";x.fillRect(0,0,1920,1080)};</script>');
    await writeFile(join(dir,'film/index.html'), '<!doctype html><style>body{margin:0}.reel-canvas{position:absolute;inset:0}</style><body><script src="../orbit/kit.js"></script><script src="../reel/reel.js"></script><script>Reel.film({duration:2,poster:0.5,scenes:{lazy:"lazy.html"},shots:[{id:"a",scene:"lazy",keys:[[0,0],[2,2]]}],composite:"void main(){ outColor = finish(A(gl_FragCoord.xy / uRes)); }",score:async()=>{}});</script>');
    const result=await render({input:join(dir,'film/index.html'),root:dir,out:join(dir,'output'),times:[0.5,1.5]});
    assert.equal(result.determinismCheck.passed,true);
    assert.notEqual(result.files[0].sha256,result.files[1].sha256,'the lazily created scene canvas reaches the reel');
  } finally {await rm(dir,{recursive:true,force:true});}
});
