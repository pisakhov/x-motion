// X Motion Reel: a long film cut from existing scene compositions, with narration.
//
// Each source film runs unchanged in a hidden same-origin iframe (?render=1). For every frame the reel
// asks the source film for a frame at a remapped local time, uploads its canvas into a WebGL2
// compositor, and blends shots with the theme's transition shader. Title cards are DOM text over the
// canvas. Sound is a new score (OrbitKit's audio studio) mixed with a pre-placed narration track,
// ducked around every spoken line, then finalized to -18 LUFS with a -1.7 dBTP true-peak ceiling.
//
// Requires ../orbit/kit.js (OrbitKit) before this file. Render with --root examples so ../ resolves:
//   node scripts/render.mjs examples/orbit/one-orbit.html --root examples --out renders/one-orbit --video
(function () {
  'use strict';
  const K = window.OrbitKit;
  if (!K) throw new Error('reel.js needs ../orbit/kit.js loaded first');
  const { clamp, lin, smooth, smoother, mix } = K;
  const W = 1920, H = 1080;
  const RENDER = new URLSearchParams(location.search).get('render') === '1';

  // ------------------------------------------------------------------ time
  // Monotone cubic (Fritsch-Carlson) through keys [[global, local], ...]. Speed is continuous and never
  // negative, so a shot can ease from real time into slow motion without a jolt or a reversal.
  function timeMap(keys) {
    const x = keys.map(k => k[0]), y = keys.map(k => k[1]), n = keys.length;
    if (n < 2) throw new Error('A shot needs at least two keys');
    for (let i = 1; i < n; i++) if (!(x[i] > x[i - 1]) || y[i] < y[i - 1]) throw new Error('Shot keys must increase');
    const d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
    m[0] = keys[0][2] ?? d[0]; m[n - 1] = keys[n - 1][2] ?? d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = keys[i][2] ?? (d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    function at(g) {
      if (g <= x[0]) return y[0] + m[0] * (g - x[0]);
      if (g >= x[n - 1]) return y[n - 1] + m[n - 1] * (g - x[n - 1]);
      let i = 0; while (g > x[i + 1]) i++;
      const h = x[i + 1] - x[i], u = (g - x[i]) / h, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * y[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * y[i + 1] + (u3 - u2) * h * m[i + 1];
    }
    // global time at which the shot reaches a local time (for placing sound on a visual event)
    function inverse(l) {
      let lo = x[0], hi = x[n - 1];
      if (l <= y[0]) return lo; if (l >= y[n - 1]) return hi;
      for (let k = 0; k < 64; k++) { const mid = (lo + hi) / 2; if (at(mid) < l) lo = mid; else hi = mid; }
      return (lo + hi) / 2;
    }
    return { at, inverse, g0: x[0], g1: x[n - 1] };
  }

  // ------------------------------------------------------------------ scenes
  function loadScene(src) {
    return new Promise((resolve, reject) => {
      const frame = document.createElement('iframe');
      frame.src = `${src}${src.includes('?') ? '&' : '?'}render=1`;
      frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
      Object.assign(frame.style, { position: 'fixed', left: '0', top: '0', width: `${W}px`, height: `${H}px`, border: '0', visibility: 'hidden', pointerEvents: 'none', zIndex: '-1' });
      frame.addEventListener('error', () => reject(new Error(`Scene failed to load: ${src}`)));
      frame.addEventListener('load', async () => {
        try {
          const win = frame.contentWindow, doc = frame.contentDocument;
          if (typeof win.renderFrame !== 'function') throw new Error(`${src} has no renderFrame`);
          await doc.fonts.ready;
          const find = () => [...doc.querySelectorAll('canvas')].find(c => c.width === W && c.height === H);
          // Some scenes (Prism) create their GL canvas lazily on the first frame they draw.
          if (!find()) await win.renderFrame(0);
          const canvas = find();
          if (!canvas) throw new Error(`${src} has no ${W}x${H} canvas`);
          resolve({ src, win, canvas, motion: win.motion });
        } catch (error) { reject(error); }
      });
      document.body.appendChild(frame);
    });
  }

  // ------------------------------------------------------------------ compositor
  const PRELUDE = `#version 300 es
precision highp float;
uniform sampler2D uA, uB;
uniform vec2 uRes;
uniform float uTime, uP, uKind, uShots;
out vec4 outColor;
vec3 toLin(vec3 c){ return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSRGB(vec3 c){ c=clamp(c,0.,1.); return mix(c*12.92, 1.055*pow(c,vec3(1./2.4))-0.055, step(0.0031308,c)); }
vec3 A(vec2 uv){ return toLin(texture(uA, uv).rgb); }
vec3 B(vec2 uv){ return toLin(texture(uB, uv).rgb); }
float hash12(vec2 p){ vec3 q=fract(vec3(p.xyx)*0.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float a=0.5, s=0.; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.02+vec2(17.1,9.7); a*=0.5; } return s; }
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
// static sub-LSB dither keeps gradients clean through H.264
vec4 finish(vec3 lin){ return vec4(toSRGB(lin) + (hash12(gl_FragCoord.xy)-0.5)/255., 1.); }
`;
  const VS = `#version 300 es
void main(){ vec2 p=vec2((gl_VertexID<<1)&2, gl_VertexID&2); gl_Position=vec4(p*2.-1.,0.,1.); }`;

  function compile(gl, fs) {
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, PRELUDE + fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const loc = new Map();
    return { p, loc: name => { if (!loc.has(name)) loc.set(name, gl.getUniformLocation(p, name)); return loc.get(name); } };
  }
  function setUniform(gl, prog, name, v) {
    const l = prog.loc(name); if (l === null) return;
    if (typeof v === 'number') gl.uniform1f(l, v);
    else if (v.length === 2) gl.uniform2fv(l, v);
    else if (v.length === 3) gl.uniform3fv(l, v);
    else if (v.length === 4) gl.uniform4fv(l, v);
    else throw new Error(`Unsupported uniform ${name}`);
  }

  // ------------------------------------------------------------------ cards (DOM typography)
  // card: { html, className, at: [in0, in1, out0, out1], rise: px, blur: px, track: [em0, em1] }
  function buildCards(cards) {
    const layer = document.createElement('div');
    layer.className = 'reel-cards';
    document.body.appendChild(layer);
    return cards.map(card => {
      const el = document.createElement('div');
      el.className = `reel-card ${card.className || ''}`;
      el.innerHTML = card.html;
      el.style.opacity = '0';
      layer.appendChild(el);
      return { card, el };
    });
  }
  function drawCards(list, t) {
    for (const { card, el } of list) {
      const [a, b, c, d] = card.at;
      const kin = smoother(lin(t, a, b)), kout = smooth(lin(t, c, d));
      const k = kin * (1 - kout);
      el.style.opacity = k.toFixed(4);
      el.style.visibility = k > 0 ? 'visible' : 'hidden';
      const rise = (card.rise ?? 0) * (1 - kin) - (card.lift ?? 0) * kout;
      const blur = (card.blur ?? 0) * (1 - kin + kout);
      el.style.transform = `translate3d(0, ${rise.toFixed(2)}px, 0)`;
      el.style.filter = blur > 0.01 ? `blur(${blur.toFixed(2)}px)` : 'none';
      if (card.track) el.style.letterSpacing = `${mix(card.track[0], card.track[1], smoother(lin(t, a, d))).toFixed(4)}em`;
    }
  }

  // ------------------------------------------------------------------ audio
  async function fetchBytes(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Missing asset ${url}`);
    return res.arrayBuffer();
  }
  // Duck envelope for the music bus: [[t, gain], ...]. Lines closer than `bridge` stay ducked between.
  function duckPoints(lines, D, { depthDb = -8, lead = 0.3, tail = 0.45, bridge = 1.2 } = {}) {
    const g = Math.pow(10, depthDb / 20), spans = [];
    for (const l of lines) {
      const s = Math.max(0, l.start - lead), e = Math.min(D, l.end + tail);
      if (spans.length && s - spans[spans.length - 1][1] < bridge) spans[spans.length - 1][1] = e;
      else spans.push([s, e]);
    }
    const pts = [[0, 1]];
    for (const [s, e] of spans) {
      const a = Math.max(pts[pts.length - 1][0] + 0.01, s - 0.35);
      pts.push([a, 1], [Math.max(a + 0.01, s), g], [e, g], [Math.min(D, e + 0.6), 1]);
    }
    if (pts[pts.length - 1][0] < D) pts.push([D, 1]);
    return pts;
  }

  // ------------------------------------------------------------------ film
  // cfg: { duration, poster, scenes: {name: src}, shots: [{id, scene, keys, kind}], composite (GLSL),
  //        uniforms(t, info) -> {}, cards: [...], voice: {audio, cues}, music: {depthDb}, score(S, R) }
  function film(cfg) {
    const D = cfg.duration;
    const shots = cfg.shots.map(s => ({ ...s, map: timeMap(s.keys) }));
    for (let i = 1; i < shots.length; i++) {
      if (shots[i].map.g0 < shots[i - 1].map.g0) throw new Error('Shots must be in order');
      if (i > 1 && shots[i].map.g0 < shots[i - 2].map.g1) throw new Error('At most two shots may overlap');
    }

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H; canvas.className = 'reel-canvas';
    document.body.appendChild(canvas);
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    const tex = [0, 1].map(() => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, W, H);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    });
    const prog = compile(gl, cfg.composite);
    const vao = gl.createVertexArray();
    const cards = buildCards(cfg.cards || []);

    const names = [...new Set(shots.map(s => s.scene))];
    let voiceBytes = null, cues = null;
    const ready = (async () => {
      const loaded = await Promise.all(names.map(n => loadScene(cfg.scenes[n])));
      const scenes = Object.fromEntries(names.map((n, i) => [n, loaded[i]]));
      if (cfg.voice) {
        [voiceBytes, cues] = await Promise.all([fetchBytes(cfg.voice.audio), fetchBytes(cfg.voice.cues).then(b => JSON.parse(new TextDecoder().decode(b)))]);
        if (cues.sampleRate !== 48000 || Math.abs(cues.duration - D) > 1e-6) throw new Error('Voice cues do not match the film');
      }
      for (const font of cfg.fonts || []) await document.fonts.load(font);
      await document.fonts.ready;
      return scenes;
    })();
    ready.catch(error => { console.error(error); });

    // Which shots are on screen at t, and the transition progress between them.
    function layers(t) {
      const on = shots.filter(s => t >= s.map.g0 && t < s.map.g1);
      if (on.length === 2) {
        const [a, b] = on;
        return { on, p: clamp((t - b.map.g0) / (a.map.g1 - b.map.g0)), kind: b.kind ?? 1 };
      }
      return { on, p: 0, kind: 0 };
    }

    async function renderFrame(t) {
      t = Number.isFinite(t) ? clamp(t, 0, D) : 0;
      const scenes = await ready;
      const { on, p, kind } = layers(t);
      const locals = [];
      for (let i = 0; i < on.length; i++) {
        const s = on[i], local = clamp(s.map.at(t), 0, scenes[s.scene].motion.duration - 1e-3);
        locals.push(local);
        await scenes[s.scene].win.renderFrame(local);
        gl.bindTexture(gl.TEXTURE_2D, tex[i]);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, scenes[s.scene].canvas);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.disable(gl.BLEND);
      gl.useProgram(prog.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[0]);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, on.length === 2 ? tex[1] : tex[0]);
      gl.uniform1i(prog.loc('uA'), 0); gl.uniform1i(prog.loc('uB'), 1);
      const info = { on: on.map(s => s.id), locals, p, kind };
      const u = { uRes: [W, H], uTime: t, uP: p, uKind: kind, uShots: on.length, ...(cfg.uniforms ? cfg.uniforms(t, info) : {}) };
      for (const [name, v] of Object.entries(u)) setUniform(gl, prog, name, v);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.finish();
      drawCards(cards, t);
    }

    // Sound helpers handed to the score: event placement through the shots' time maps.
    const shotById = id => { const s = shots.find(x => x.id === id); if (!s) throw new Error(`Unknown shot ${id}`); return s; };
    const R = {
      D, shots,
      at: (id, local) => shotById(id).map.inverse(local),     // global time of a shot-local event
      span: id => [shotById(id).map.g0, shotById(id).map.g1],
      lines: () => cues ? cues.lines : [],
    };

    async function mixdown(sampleRate, stems = 'mix') {
      await ready;
      const ctx = new OfflineAudioContext(2, Math.ceil(D * sampleRate), sampleRate);
      const voiceBuf = voiceBytes ? await ctx.decodeAudioData(voiceBytes.slice(0)) : null;
      await K.deterministicGraph(ctx, async () => {
        const bedGate = ctx.createGain(), voiceGate = ctx.createGain();
        bedGate.gain.value = stems === 'voice' ? 0 : 1; voiceGate.gain.value = stems === 'bed' ? 0 : 1;
        bedGate.connect(ctx.destination); voiceGate.connect(ctx.destination);
        const music = ctx.createGain(), fx = ctx.createGain(), voice = ctx.createGain();
        music.connect(bedGate); fx.connect(bedGate); voice.connect(voiceGate);
        const lines = R.lines();
        const md = cfg.mix ?? {};
        if (lines.length) {
          const C = K.studio(ctx, D, ctx.createGain());
          C.curve(music.gain, duckPoints(lines, D, { depthDb: md.musicDuckDb ?? -8 }));
          C.curve(fx.gain, duckPoints(lines, D, { depthDb: md.fxDuckDb ?? -4 }));
        }
        const S = K.studio(ctx, D, music), FX = K.studio(ctx, D, fx), V = K.studio(ctx, D, voice);
        if (voiceBuf) {
          const src = ctx.createBufferSource(); src.buffer = voiceBuf;
          const g = ctx.createGain(); g.gain.value = md.voiceGain ?? 1;
          // a touch of space so the voice sits in the film's room rather than on top of it
          const room = V.reverb(md.roomSeconds ?? 1.6, 977, { decay: 1.1, dark: 0.7 }, md.roomWet ?? 0.1);
          const centre = ctx.createStereoPanner(); centre.pan.value = 0;
          src.connect(g); g.connect(centre); centre.connect(V.master); g.connect(room);
          src.start(0);
        }
        await cfg.score(S, FX, R);
      });
      const buf = await ctx.startRendering();
      return stems === 'mix' ? K.finalize(buf, cfg.loudness ?? -18, -1.7, D) : buf;
    }

    window.motion = { width: W, height: H, duration: D, fps: 30, poster: cfg.poster };
    window.renderFrame = renderFrame;
    window.renderAudio = async ({ sampleRate = 48000 } = {}) => mixdown(sampleRate);
    // Analysis hook (not used by the renderer): unfinalized stems for measuring voice-to-bed balance.
    window.reelStems = async ({ sampleRate = 48000 } = {}) => ({ voice: await mixdown(sampleRate, 'voice'), bed: await mixdown(sampleRate, 'bed') });
    window.reel = { shots, R, layers, ready };
    if (!RENDER) preview(D, renderFrame, cfg.poster);
  }

  // Browser preview: plays at real time (frames may drop while scenes render); click for sound.
  function preview(D, renderFrame, poster) {
    let audio = null, t0 = performance.now(), busy = false;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.body.style.cursor = 'pointer';
    document.body.title = 'Click to play with sound';
    document.addEventListener('click', async () => {
      if (audio) { audio.ac.close(); audio = null; t0 = performance.now(); return; }
      const ac = new AudioContext();
      const buf = await window.renderAudio({ sampleRate: ac.sampleRate });
      const src = ac.createBufferSource(); src.buffer = buf; src.connect(ac.destination);
      const start = ac.currentTime + 0.05; src.start(start); src.loop = true;
      audio = { ac, start };
    });
    const loop = async () => {
      if (!busy) {
        busy = true;
        const t = still ? poster : audio ? ((audio.ac.currentTime - audio.start) % D + D) % D : ((performance.now() - t0) / 1000) % D;
        try { await renderFrame(t); } finally { busy = false; }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  window.Reel = { film, timeMap, duckPoints, W, H, clamp, lin, smooth, smoother, mix };
})();
