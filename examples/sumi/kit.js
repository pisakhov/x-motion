// Sumi kit: shared, deterministic helpers for the ink-and-paper films.
// Original procedural code. No assets, no network, no wall-clock state in render mode.
(function () {
  'use strict';
  const XM = (window.XM = {});
  XM.render = new URLSearchParams(location.search).get('render') === '1';
  XM.W = 1920;
  XM.H = 1080;

  // ---------- math ----------
  XM.clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  XM.smooth = (a, b, x) => { const u = XM.clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
  XM.mix = (a, b, u) => a + (b - a) * u;
  XM.mulberry32 = function (seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Periodic gradient noise on an N x N grid with P x P cells. Returns Float32Array in about [-1, 1].
  function gradTile(N, P, rnd) {
    const g = new Float32Array(P * P * 2);
    for (let i = 0; i < P * P; i++) { const a = rnd() * Math.PI * 2; g[2 * i] = Math.cos(a); g[2 * i + 1] = Math.sin(a); }
    const out = new Float32Array(N * N);
    const fade = u => u * u * u * (u * (u * 6 - 15) + 10);
    for (let y = 0; y < N; y++) {
      const fy = (y / N) * P, iy = Math.floor(fy), uy = fy - iy, vy = fade(uy);
      for (let x = 0; x < N; x++) {
        const fx = (x / N) * P, ix = Math.floor(fx), ux = fx - ix, vx = fade(ux);
        const c = (cx, cy, dx, dy) => { const k = (((cy % P) + P) % P) * P + (((cx % P) + P) % P); return g[2 * k] * dx + g[2 * k + 1] * dy; };
        const a = c(ix, iy, ux, uy), b = c(ix + 1, iy, ux - 1, uy), d = c(ix, iy + 1, ux, uy - 1), e = c(ix + 1, iy + 1, ux - 1, uy - 1);
        out[y * N + x] = 1.6 * ((a + (b - a) * vx) + ((d + (e - d) * vx) - (a + (b - a) * vx)) * vy);
      }
    }
    return out;
  }

  // ---------- WebGL ----------
  const VERT = `#version 300 es
in vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

  XM.GLSL = `#version 300 es
precision highp float;
uniform sampler2D uNoise;   // RG curl field, B noise, A noise (tile = 8 cells)
uniform sampler2D uPaper;   // R tone, G fibres, B tooth, A absorbency
uniform vec2 uRes;
uniform float uT;
out vec4 outColor;
vec4 nz(vec2 p){ return texture(uNoise, p); }
float n1(vec2 p){ return texture(uNoise, p).b; }
float n2(vec2 p){ return texture(uNoise, p).a; }
float fbm3(vec2 p){ return 0.55*n1(p) + 0.3*n2(p*2.03+0.37) + 0.15*n1(p*4.01+0.71); }
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 srgb(vec3 c){ return pow(max(c, 0.0), vec3(1.0/2.2)); }
float sat(float x){ return clamp(x, 0.0, 1.0); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float segD(vec2 p, vec2 a, vec2 b, out float h){ vec2 pa = p - a, ba = b - a; h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
// Paper sample at pixel coordinate (y down), optional blur via LOD.
vec4 paperAt(vec2 px, float lod){ return textureLod(uPaper, px / uRes, lod); }
// Washi colour in linear light from a paper sample. light: 0..1 local illumination.
vec3 washi(vec4 pp, float light){
  vec3 lit = lin(vec3(0.945, 0.913, 0.847)), shade = lin(vec3(0.878, 0.827, 0.729));
  vec3 c = mix(shade, lit, light);
  c *= 1.0 + (pp.r - 0.5) * 0.09;
  c += vec3(0.010, 0.009, 0.006) * (pp.g - 0.2);
  return c;
}
vec3 inkOver(vec3 base, float d){ return base * exp(-d * vec3(3.4, 3.55, 3.75)); }
vec3 dither(vec3 c){ return c + (hash12(gl_FragCoord.xy) - 0.5) / 255.0; }
`;

  XM.initGL = function (canvas) {
    canvas.width = XM.W; canvas.height = XM.H;
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    XM.gl = gl;
    XM.noiseTex = makeNoise(gl);
    XM.paperTex = makePaper(gl);
    return gl;
  };

  XM.program = function (gl, fragBody) {
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, XM.GLSL + fragBody));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const loc = {};
    const prog = {
      p,
      use(uniforms) {
        gl.useProgram(p);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, XM.noiseTex);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, XM.paperTex);
        const set = (name, v) => {
          if (!(name in loc)) loc[name] = gl.getUniformLocation(p, name);
          const l = loc[name]; if (l === null) return;
          if (typeof v === 'number') gl.uniform1f(l, v);
          else if (v.length === 2) gl.uniform2fv(l, v);
          else if (v.length === 3) gl.uniform3fv(l, v);
          else if (v.length === 4) gl.uniform4fv(l, v);
          else gl.uniform1fv(l, v);
        };
        gl.uniform1i(gl.getUniformLocation(p, 'uNoise'), 0);
        gl.uniform1i(gl.getUniformLocation(p, 'uPaper'), 1);
        set('uRes', [XM.W, XM.H]);
        for (const k in uniforms) set(k, uniforms[k]);
      },
      draw(uniforms) {
        this.use(uniforms);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, XM.W, XM.H);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
    return prog;
  };

  XM.sync = function () { const px = new Uint8Array(4); XM.gl.readPixels(0, 0, 1, 1, XM.gl.RGBA, XM.gl.UNSIGNED_BYTE, px); return px; };

  function makeNoise(gl) {
    const N = 256, rnd = XM.mulberry32(9071);
    const psi = gradTile(N, 8, rnd), a = gradTile(N, 8, rnd), b = gradTile(N, 8, rnd);
    const data = new Float32Array(N * N * 4);
    const at = (x, y) => psi[((y + N) % N) * N + ((x + N) % N)];
    const k = N / 8 / 2; // derivative per cell unit
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k;
      data[i] = dy / 4; data[i + 1] = -dx / 4; // curl, roughly unit magnitude
      data[i + 2] = 0.5 + 0.5 * a[y * N + x];
      data[i + 3] = 0.5 + 0.5 * b[y * N + x];
    }
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, N, N, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    XM.noiseCPU = { N, a, b };
    return t;
  }

  // Bake washi: R tone (mottle + grain), G fibres, B tooth, A absorbency. Deterministic.
  function makePaper(gl) {
    const W = XM.W, H = XM.H, rnd = XM.mulberry32(20261106);
    const { N, a, b } = XM.noiseCPU;
    const samp = (arr, u, v) => { // bilinear, periodic, u/v in tile units
      const x = (((u % 1) + 1) % 1) * N, y = (((v % 1) + 1) % 1) * N;
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, x1 = (x0 + 1) % N, y1 = (y0 + 1) % N;
      const p = arr[y0 * N + x0] + (arr[y0 * N + x1] - arr[y0 * N + x0]) * fx;
      const q = arr[y1 * N + x0] + (arr[y1 * N + x1] - arr[y1 * N + x0]) * fx;
      return p + (q - p) * fy;
    };
    // Fibres drawn with Canvas 2D.
    const fc = document.createElement('canvas'); fc.width = W; fc.height = H;
    const c = fc.getContext('2d', { willReadFrequently: true });
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.lineCap = 'round';
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * W, y = rnd() * H, ang = rnd() * Math.PI * 2, len = 30 + Math.pow(rnd(), 2) * 260;
      const bend = (rnd() - 0.5) * len * 0.5;
      const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
      const mx = (x + ex) / 2 - Math.sin(ang) * bend, my = (y + ey) / 2 + Math.cos(ang) * bend;
      c.strokeStyle = `rgba(255,255,255,${(0.10 + rnd() * 0.28).toFixed(3)})`;
      c.lineWidth = 0.8 + rnd() * 1.4;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(mx, my, ex, ey); c.stroke();
    }
    const fib = c.getImageData(0, 0, W, H).data;
    // Grain: seeded white noise, softened by a 3x3 box blur.
    const g0 = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) g0[i] = rnd();
    const g1 = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) { const yy = Math.min(H - 1, Math.max(0, y + dy)) * W; for (let dx = -1; dx <= 1; dx++) s += g0[yy + Math.min(W - 1, Math.max(0, x + dx))]; }
      g1[y * W + x] = s / 9;
    }
    const out = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, u = x / H, v = y / H;
      const mott = 0.6 * samp(a, u * 0.35, v * 0.35) + 0.4 * samp(b, u * 0.9 + 0.3, v * 0.9);
      const grain = (g1[i] - 0.5) * 3.0; // ~[-0.75, 0.75]
      const f = fib[i * 4] / 255;
      const tone = 0.5 + mott * 0.32 + grain * 0.10 + f * 0.12;
      const tooth = 0.5 + grain * 0.55 + samp(b, u * 6.0, v * 6.0) * 0.18 + f * 0.25;
      const absorb = 0.5 + 0.5 * samp(a, u * 2.2 + 0.5, v * 2.2);
      out[i * 4] = Math.round(255 * XM.clamp(tone));
      out[i * 4 + 1] = Math.round(255 * XM.clamp(f));
      out[i * 4 + 2] = Math.round(255 * XM.clamp(tooth));
      out[i * 4 + 3] = Math.round(255 * XM.clamp(absorb));
    }
    // Flip rows so texture v follows pixel y (we sample with y-down pixel coords).
    const flipped = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) flipped.set(out.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, flipped);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // ---------- audio ----------
  const A = (XM.audio = {});
  A.noise = function (ctx, seconds, seed, color = 'white') {
    const len = Math.ceil(seconds * ctx.sampleRate), buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const r = XM.mulberry32(seed * 7 + ch * 1013), d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, br = 0;
      for (let i = 0; i < len; i++) {
        const w = r() * 2 - 1;
        if (color === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
        else if (color === 'brown') { br = (br + 0.02 * w) / 1.02; d[i] = br * 3.5; }
        else d[i] = w * 0.5;
      }
    }
    return buf;
  };
  // Synthetic hall: seeded noise, exponential decay, darkening over time.
  A.impulse = function (ctx, seconds, seed, { decay = 1.2, pre = 0.025, dark = 0.9 } = {}) {
    const sr = ctx.sampleRate, len = Math.ceil(seconds * sr), buf = ctx.createBuffer(2, len, sr), p0 = Math.floor(pre * sr);
    for (let ch = 0; ch < 2; ch++) {
      const r = XM.mulberry32(seed + ch * 31), d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = p0; i < len; i++) {
        const t = (i - p0) / sr, k = 0.55 - dark * 0.5 * Math.min(1, t / seconds);
        lp += (r() * 2 - 1 - lp) * k;
        const fadeIn = Math.min(1, (i - p0) / (0.004 * sr));
        d[i] = lp * Math.exp(-t / decay) * fadeIn * (1 - Math.pow(t / (seconds - pre), 4));
      }
    }
    return buf;
  };
  // Automation helper: points [[time, value], ...]; ramps are linear unless value has 'e'.
  A.env = function (param, pts, base = 0) {
    param.setValueAtTime(base, 0);
    for (const [t, v, kind] of pts) {
      if (kind === 'set') param.setValueAtTime(v, t);
      else if (kind === 'exp') param.exponentialRampToValueAtTime(Math.max(v, 1e-5), t);
      else param.linearRampToValueAtTime(v, t);
    }
  };
  // Seeded smooth random curve for gusts and drift (values ~[0,1]).
  A.curve = function (len, seed, knots = 12, lo = 0, hi = 1) {
    const r = XM.mulberry32(seed), k = Array.from({ length: knots + 2 }, () => lo + (hi - lo) * r()), out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const x = (i / (len - 1)) * knots, j = Math.floor(x), f = x - j, s = f * f * (3 - 2 * f);
      out[i] = k[j] + (k[j + 1] - k[j]) * s;
    }
    return out;
  };
  // Bit-exact mixing: Chromium sums a node's inputs in an unspecified order, and float addition is only
  // order-independent for two operands. A summer chains 2-input gain nodes so every mix point has <= 2 inputs.
  A.summer = function (ctx, target) {
    let open = target, count = 0;
    return node => {
      if (count === 1) { const j = ctx.createGain(); j.connect(open); open = j; count = 0; }
      node.connect(open); count++;
    };
  };
  // Master chain: dry + reverb sends -> glue compressor -> limiter -> gain -> destination.
  A.master = function (ctx, { seed = 7, reverbSeconds = 4.5, decay = 1.3, gain = 1, fade = null, limit = -6 } = {}) {
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -22; glue.knee.value = 10; glue.ratio.value = 2.2; glue.attack.value = 0.03; glue.release.value = 0.4;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = limit; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
    const out = ctx.createGain(); out.gain.value = gain;
    if (fade) A.env(out.gain, [[fade[0], gain, 'set'], [fade[1], 0]], gain);   // master fade so the reverb tail is gone by the last frame
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 28; hp.Q.value = 0.6;
    const bus = ctx.createGain();
    bus.connect(hp); hp.connect(glue); glue.connect(lim); lim.connect(out); out.connect(ctx.destination);
    const verb = ctx.createConvolver(); verb.normalize = true; verb.buffer = A.impulse(ctx, reverbSeconds, seed, { decay });
    const send = ctx.createGain(); send.gain.value = 1; send.connect(verb);
    const addDry = A.summer(ctx, bus), addWet = A.summer(ctx, send);
    addDry(verb);
    return { bus, send, out, addDry, addWet };
  };
  // Route a source node through gain + pan to dry bus and reverb send.
  A.route = function (ctx, m, node, { pan = 0, dry = 1, wet = 0.4 } = {}) {
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    node.connect(p);
    const d = ctx.createGain(); d.gain.value = dry; p.connect(d); m.addDry(d);
    const w = ctx.createGain(); w.gain.value = wet; p.connect(w); m.addWet(w);
    return p;
  };
  // Breathy end-blown flute. notes: [{t0, t1, f, scoop, level}]
  A.flute = function (ctx, m, { t0, t1, f, scoop = 0.97, scoopTime = 0.35, level = 0.2, vib = 0.006, pan = 0, wet = 0.6, fallTo = null, seed = 3 }) {
    const wave = ctx.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.16, 0.07, 0.025]));
    const osc = ctx.createOscillator(); osc.setPeriodicWave(wave);
    osc.frequency.setValueAtTime(f * scoop, t0);
    osc.frequency.exponentialRampToValueAtTime(f, t0 + scoopTime);
    if (fallTo) { osc.frequency.setValueAtTime(f, t1 - 0.6); osc.frequency.exponentialRampToValueAtTime(fallTo, t1); }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 4.6;
    const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t0); lg.gain.linearRampToValueAtTime(0, t0 + 0.8); lg.gain.linearRampToValueAtTime(f * vib, t0 + 1.8);
    lfo.connect(lg); lg.connect(osc.frequency);
    const amp = ctx.createGain();
    A.env(amp.gain, [[t0, 0, 'set'], [t0 + 0.12, level * 0.45], [t0 + 0.6, level], [t1 - 0.7, level * 0.85], [t1, 0]]);
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = f * 5; tone.Q.value = 0.3;
    osc.connect(tone); tone.connect(amp);
    // breath: band locked to the note plus broadband air
    const nb = ctx.createBufferSource(); nb.buffer = A.noise(ctx, t1 - t0 + 0.2, seed, 'white');
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 9;
    const air = ctx.createBiquadFilter(); air.type = 'bandpass'; air.frequency.value = f * 3.2; air.Q.value = 0.7;
    const bg = ctx.createGain(); A.env(bg.gain, [[t0, 0, 'set'], [t0 + 0.08, level * 1.6], [t0 + 0.5, level * 0.55], [t1 - 0.5, level * 0.45], [t1, 0]]);
    const ag = ctx.createGain(); A.env(ag.gain, [[t0, 0, 'set'], [t0 + 0.06, level * 0.5], [t0 + 0.4, level * 0.16], [t1 - 0.4, level * 0.14], [t1 + 0.15, 0]]);
    nb.connect(bp); bp.connect(bg); nb.connect(air); air.connect(ag);
    const sum = ctx.createGain(), add = A.summer(ctx, sum); add(amp); add(bg); add(ag);
    A.route(ctx, m, sum, { pan, dry: 0.75, wet });
    osc.start(t0); osc.stop(t1 + 0.1); lfo.start(t0); lfo.stop(t1 + 0.1); nb.start(t0); nb.stop(t1 + 0.2);
  };
  // Karplus-Strong pluck rendered into a buffer. glide: [{at, f}] optional pitch target after `at` seconds.
  A.pluck = function (ctx, m, { t, f, level = 0.3, pan = 0, wet = 0.45, len = 4, damp = 0.996, bright = 0.5, glide = null, seed = 11 }) {
    const sr = ctx.sampleRate, n = Math.ceil(len * sr), buf = ctx.createBuffer(1, n, sr), out = buf.getChannelData(0);
    const r = XM.mulberry32(seed), P = Math.round(sr / f), exc = new Float32Array(P * 2);
    let lp = 0;
    for (let i = 0; i < exc.length; i++) { lp += (r() * 2 - 1 - lp) * bright; exc[i] = i < P ? lp * (1 - i / P) * Math.min(1, i / 24) : 0; }
    const ring = new Float32Array(8192), mask = 8191;
    const read = x => { const i = Math.floor(x), fr = x - i; return ring[i & mask] * (1 - fr) + ring[(i + 1) & mask] * fr; };
    let damping = 0;
    for (let i = 0; i < n; i++) {
      let fi = f;
      if (glide) { const u = XM.smooth(glide.at, glide.at + glide.dur, i / sr); fi = f * Math.pow(glide.f / f, u); }
      const d = sr / fi - 0.5, w = i;
      const a = read(w - d), b = read(w - d - 1);
      damping += (0.5 * (a + b) - damping) * 0.85;
      const y = (i < exc.length ? exc[i] : 0) + damp * damping;
      ring[w & mask] = y; out[i] = y;
    }
    const fade = Math.floor(0.05 * sr);
    for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 220; body.Q.value = 1.2; body.gain.value = 4;
    const top = ctx.createBiquadFilter(); top.type = 'lowpass'; top.frequency.value = 4200; top.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.value = level;
    src.connect(body); body.connect(top); top.connect(g);
    A.route(ctx, m, g, { pan, dry: 0.8, wet });
    src.start(t);
  };
  // Low gong: inharmonic partials with slow beating; low partials ring longest.
  A.gong = function (ctx, m, { t, f = 62, level = 0.4, pan = 0, wet = 0.5, end = null }) {
    const parts = [[0.5, 0.35, 7], [1, 1, 6], [1.006, 0.6, 6], [1.52, 0.5, 4.2], [2.0, 0.32, 3.4], [2.41, 0.3, 2.8], [2.94, 0.18, 2.2], [3.63, 0.12, 1.6], [4.77, 0.07, 1.1]];
    const sum = ctx.createGain(); sum.gain.value = level;
    const add = A.summer(ctx, sum);
    for (const [ratio, amp, dec] of parts) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f * ratio * 1.012, t); o.frequency.exponentialRampToValueAtTime(f * ratio, t + 0.9);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, 0); g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.012 + ratio * 0.004);
      g.gain.setTargetAtTime(0, t + 0.02, dec / 4.6);
      o.connect(g); add(g); o.start(t); o.stop(end ? end[1] : t + dec * 2);
    }
    // mallet: soft low thump
    const th = ctx.createOscillator(); th.frequency.setValueAtTime(f * 1.9, t); th.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.12);
    const tg = ctx.createGain(); A.env(tg.gain, [[t, 0, 'set'], [t + 0.006, 0.5], [t + 0.25, 0.0001, 'exp']]);
    th.connect(tg); add(tg); th.start(t); th.stop(t + 0.3);
    const outG = ctx.createGain();
    if (end) A.env(outG.gain, [[end[0], 1, 'set'], [end[1], 0]], 1); else outG.gain.value = 1;
    sum.connect(outG);
    A.route(ctx, m, outG, { pan, dry: 0.8, wet });
  };
  // Filtered noise layer with gain automation; returns {src, filter, gain}.
  A.noiseLayer = function (ctx, m, { t0 = 0, t1, seed, color = 'pink', type = 'bandpass', freq = 800, q = 0.7, pts, pan = 0, wet = 0.3, dry = 1 }) {
    const src = ctx.createBufferSource(); src.buffer = A.noise(ctx, t1 - t0 + 0.1, seed, color);
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
    const g = ctx.createGain(); A.env(g.gain, pts);
    src.connect(fl); fl.connect(g);
    A.route(ctx, m, g, { pan, dry, wet });
    src.start(t0); src.stop(t1 + 0.05);
    return { src, fl, g };
  };

  // ---------- harness ----------
  XM.run = function ({ duration, draw }) {
    window.renderFrame = t => { draw(t); };
    if (XM.render) return;
    let t0 = null, actx = null, src = null, audioStart = 0, busy = false;
    const loop = now => {
      let t;
      if (src) t = (actx.currentTime - audioStart) % duration;
      else { if (t0 === null) t0 = now; t = ((now - t0) / 1000) % duration; }
      draw(Math.max(0, t));
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    addEventListener('click', async () => {
      if (busy) return; busy = true;
      try {
        if (!actx) actx = new AudioContext();
        if (src) { src.stop(); src = null; return; }
        const buffer = await window.renderAudio({ sampleRate: actx.sampleRate });
        src = actx.createBufferSource(); src.buffer = buffer; src.loop = true; src.connect(actx.destination);
        audioStart = actx.currentTime + 0.05; src.start(audioStart);
      } finally { busy = false; }
    });
  };
})();
