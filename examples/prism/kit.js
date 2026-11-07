// X Motion · Prism kit. Shared, original helpers for the Prism films.
// Visuals: one full-screen WebGL2 fragment shader driven purely by uniforms derived from t.
// Audio: seeded noise, seeded synthetic reverb, glass/air/water voices, in-page mastering.
'use strict';
(function () {
  const XM = {};
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, u) => a + (b - a) * u;
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const smooth = u => u * u * (3 - 2 * u);
  const smoother = u => u * u * u * (u * (u * 6 - 15) + 10);
  Object.assign(XM, { clamp, mix, prog, smooth, smoother });

  XM.mulberry32 = function (seed) {
    let s = seed | 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ---------- WebGL2 full-screen passes ----------
  // SwiftShader (software GL) pays for every instruction in a shader, even inside untaken branches,
  // so films split work into small single-purpose passes that render into float targets.
  XM.gpu = function () {
    const canvas = document.createElement('canvas');
    canvas.width = 1920; canvas.height = 1080;
    document.body.appendChild(canvas);
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    const floatOK = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    const vs = '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const compile = (type, src) => {
      const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    function program(frag) {
      const pr = gl.createProgram();
      gl.attachShader(pr, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, frag));
      gl.bindAttribLocation(pr, 0, 'p');
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      return { pr, cache: {} };
    }
    function target(w, h) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (floatOK) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fbo, w, h };
    }
    // run(program, uniforms, target|null, { samplerName: target }, [x, y, w, h] scissor in GL pixels)
    function run(p, uniforms, dst = null, inputs = {}, rect = null) {
      gl.useProgram(p.pr);
      if (rect) { gl.enable(gl.SCISSOR_TEST); gl.scissor(rect[0], rect[1], rect[2], rect[3]); } else gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fbo : null);
      gl.viewport(0, 0, dst ? dst.w : 1920, dst ? dst.h : 1080);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const where = n => (n in p.cache ? p.cache[n] : (p.cache[n] = gl.getUniformLocation(p.pr, n)));
      Object.entries(inputs).forEach(([name, t], i) => {
        gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t.tex);
        const l = where(name); if (l !== null) gl.uniform1i(l, i);
      });
      for (const [name, v] of Object.entries(uniforms)) {
        const l = where(name); if (l === null) continue;
        if (typeof v === 'number') gl.uniform1f(l, v);
        else if (v.type) gl['uniform' + v.type](l, v.value); // e.g. { type: '2fv', value: Float32Array }
        else if (v.length === 2) gl.uniform2fv(l, v);
        else if (v.length === 3) gl.uniform3fv(l, v);
        else if (v.length === 4) gl.uniform4fv(l, v);
        else gl.uniform1fv(l, v);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    const finish = () => gl.finish();
    // Pinhole camera shared by JS and GLSL: project a world point to GL pixel coordinates.
    function camera(cam, tgt, fov) {
      const sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const nrm = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
      const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const fw = nrm(sub(tgt, cam)), rt = nrm(crs(fw, [0, 1, 0])), up = crs(rt, fw), f = 1 / Math.tan(fov / 2);
      const project = w => { const v = sub(w, cam), z = dot(v, fw); return [960 + 540 * f * dot(v, rt) / z, 540 + 540 * f * dot(v, up) / z]; };
      const box = (points, pad = 4) => {
        const p = points.map(project), xs = p.map(q => q[0]), ys = p.map(q => q[1]);
        const x0 = Math.max(0, Math.floor(Math.min(...xs) - pad)), y0 = Math.max(0, Math.floor(Math.min(...ys) - pad));
        const x1 = Math.min(1920, Math.ceil(Math.max(...xs) + pad)), y1 = Math.min(1080, Math.ceil(Math.max(...ys) + pad));
        return [x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
      };
      return { project, box };
    }
    return { canvas, gl, program, target, run, finish, floatOK, camera };
  };

  // Common GLSL: spectral colour, tone mapping, hashing.
  XM.glslCommon = `
float gauss(float x, float m, float s){ float d=(x-m)/s; return exp(-d*d); }
// Smooth analytic fit of display-linear RGB for a wavelength in nm (380..700).
vec3 spectral(float nm){
  vec3 c = vec3(gauss(nm,606.,46.) + 0.14*gauss(nm,420.,22.),
                gauss(nm,543.,44.),
                gauss(nm,452.,34.));
  return c * smoothstep(372.,410.,nm) * (1.-smoothstep(660.,712.,nm));
}
float hash12(vec2 p){ vec3 q=fract(vec3(p.xyx)*0.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y); }
float fbm3(vec2 p){ float a=0.5, s=0.; for(int i=0;i<3;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.7); a*=0.5; } return s; }
vec3 tonemap(vec3 x){ // exponential shoulder: lit paper (~0.9) lands near sRGB 0.92, light sources roll off softly
  return 1.0 - exp(-x*1.85);
}
vec3 toSRGB(vec3 c){ c=clamp(c,0.,1.); return mix(c*12.92, 1.055*pow(c,vec3(1./2.4))-0.055, step(0.0031308,c)); }
vec3 finish(vec3 lin, vec2 frag){ // static, sub-LSB dither to keep pale gradients clean after H.264
  vec3 s = toSRGB(tonemap(lin));
  return s + (hash12(frag)-0.5)/255.;
}
`;

  // ---------- runtime: window.motion, renderFrame, preview loop ----------
  XM.film = function ({ duration, poster, frame, audio }) {
    window.motion = { width: 1920, height: 1080, duration, fps: 30, poster };
    window.renderFrame = function (t) {
      const s = Number.isFinite(t) ? clamp(t, 0, duration) : 0;
      frame(s);
    };
    window.renderAudio = audio;
    const isRender = new URLSearchParams(location.search).get('render') === '1';
    if (isRender) return;
    // Preview only: loop in the browser; click to hear the same buffer the renderer exports.
    let epoch = null, actx = null, src = null, startAt = 0;
    function tick(now) {
      let t;
      if (actx && src) t = (actx.currentTime - startAt) % duration;
      else { if (epoch === null) epoch = now; t = ((now - epoch) / 1000) % duration; }
      frame(t);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    let pending = null;
    window.addEventListener('click', async () => {
      if (pending) return;
      actx = actx || new AudioContext();
      pending = audio({ sampleRate: actx.sampleRate });
      const rendered = await pending;
      const buffer = new AudioBuffer({ length: rendered.length, numberOfChannels: 2, sampleRate: rendered.sampleRate });
      for (let c = 0; c < 2; c++) buffer.copyToChannel(rendered.getChannelData(c), c);
      if (src) src.stop();
      src = actx.createBufferSource(); src.buffer = buffer; src.loop = true; src.connect(actx.destination);
      startAt = actx.currentTime + 0.05; src.start(startAt);
      pending = null;
    });
  };

  // ---------- audio ----------
  const A = {};
  XM.audio = A;

  // Deterministic mixing rule: Chromium sums 3+ connections into one AudioNode in an
  // unspecified order, so float rounding differs between renders. Every voice is therefore
  // synthesized in JavaScript into one stereo mix; the Web Audio graph only adds space
  // (dry + convolver: two inputs, and float addition of two terms is commutative).

  // Seeded noise as raw arrays. colour: 'white' | 'pink' | 'brown'.
  A.noiseArr = function (len, seed, colour = 'pink') {
    const out = [];
    for (let ch = 0; ch < 2; ch++) {
      const r = XM.mulberry32(seed * 7919 + ch * 104729 + 1), d = new Float32Array(len);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
      for (let i = 0; i < len; i++) {
        const w = r() * 2 - 1;
        if (colour === 'white') d[i] = w * 0.5;
        else if (colour === 'brown') { br = (br + 0.02 * w) / 1.02; d[i] = br * 3.5; }
        else {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
          b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        }
      }
      out.push(d);
    }
    return out;
  };

  // Seeded synthetic room: decorrelated stereo noise, exponential decay, darkening tail.
  A.impulse = function (ctx, seconds, seed, { decay = 3, bright = 0.55, predelay = 0.012 } = {}) {
    const sr = ctx.sampleRate, len = Math.ceil(seconds * sr), buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const r = XM.mulberry32(seed * 31 + ch * 977 + 5), d = buf.getChannelData(ch);
      let lp = 0;
      const pre = Math.floor(predelay * sr * (1 + ch * 0.37));
      for (let i = 0; i < len; i++) {
        const t = i / sr, w = r() * 2 - 1;
        const k = clamp(bright * Math.exp(-t * 1.6) + 0.04); // one-pole coefficient falls over time
        lp += k * (w - lp);
        const env = Math.exp(-t * 6.9 / decay) * (i < pre ? 0 : 1) * Math.min(1, (i - pre) / (0.004 * sr) + 0.0001);
        d[i] = lp * env * (1 - smooth(prog(t, seconds - 0.15, seconds)));
      }
    }
    return buf;
  };

  // Piecewise-linear automation [[t, v], ...] as a function of time (held at both ends).
  A.pts = function (points) {
    return t => {
      if (t <= points[0][0]) return points[0][1];
      for (let i = 1; i < points.length; i++) if (t < points[i][0]) {
        const [ta, va] = points[i - 1], [tb, vb] = points[i];
        return va + (vb - va) * (t - ta) / (tb - ta);
      }
      return points[points.length - 1][1];
    };
  };
  const fnOf = v => typeof v === 'function' ? v : Array.isArray(v) ? A.pts(v) : () => v;

  // A stereo mix buffer that every voice adds into, sample by sample.
  A.mix = function (sampleRate, seconds) {
    const n = Math.ceil(seconds * sampleRate);
    return { sr: sampleRate, n, L: new Float32Array(n), R: new Float32Array(n) };
  };
  // Equal-power pan, same law as StereoPannerNode for a mono source.
  function add(M, i, v, pan) {
    const x = (clamp(pan, -1, 1) + 1) * 0.25 * Math.PI;
    M.L[i] += v * Math.cos(x); M.R[i] += v * Math.sin(x);
  }
  // Generic sine voice: freq(t), amp(t), pan(t) may be numbers, point lists or functions.
  A.tone = function (M, t0, t1, freq, amp, pan = 0) {
    const F = fnOf(freq), G = fnOf(amp), P = fnOf(pan), sr = M.sr;
    const i0 = Math.max(0, Math.floor(t0 * sr)), i1 = Math.min(M.n, Math.ceil(t1 * sr));
    let ph = 0;
    for (let i = i0; i < i1; i++) {
      const t = i / sr;
      add(M, i, Math.sin(ph) * G(t), P(t));
      ph += 2 * Math.PI * F(t) / sr; if (ph > 6.283185307179586) ph -= 6.283185307179586;
    }
  };
  // RBJ biquad over an array (bandpass = constant 0 dB peak, lowpass, highpass).
  A.filter = function (x, sr, type, f, Q) {
    const w = 2 * Math.PI * f / sr, al = Math.sin(w) / (2 * Q), c = Math.cos(w);
    let b0, b1, b2; const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
    if (type === 'bandpass') { b0 = al; b1 = 0; b2 = -al; }
    else if (type === 'lowpass') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    else { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  };
  // Filtered noise bed (stereo): noise = [L, R] arrays from noiseArr, amp(t) automation.
  A.wash = function (M, noise, t0, t1, type, f, Q, amp, { offset = 0 } = {}) {
    const G = fnOf(amp), sr = M.sr, i0 = Math.max(0, Math.floor(t0 * sr)), i1 = Math.min(M.n, Math.ceil(t1 * sr));
    const len = i1 - i0, off = Math.floor(offset * sr);
    [M.L, M.R].forEach((dst, ch) => {
      const src = noise[ch], x = new Float32Array(len);
      for (let k = 0; k < len; k++) x[k] = src[(k + off) % src.length];
      const y = A.filter(x, sr, type, f, Q);
      for (let k = 0; k < len; k++) dst[i0 + k] += y[k] * G((i0 + k) / sr);
    });
  };

  // Struck glass: inharmonic partials, each with its own decay, slight stereo detune.
  A.glass = function (M, t, f, amp, { decay = 2.4, attack = 0.004, ratios = [1, 2.32, 4.25, 6.63], weights = [1, 0.42, 0.18, 0.07], pan = 0, detune = 0.6 } = {}) {
    ratios.forEach((ratio, i) => {
      for (const side of [-1, 1]) {
        const fr = f * ratio * (1 + side * detune * 0.0007 * (i + 1));
        const peak = amp * weights[i] * 0.5, d = decay / (1 + i * 0.9), ta = t + attack * (1 + i * 0.3), end = ta + d * 1.6 + 0.1;
        const env = tt => tt < ta ? peak * (tt - t) / (ta - t) : peak * Math.exp(-(tt - ta) * 4.6 / d) * (1 - smooth(prog(tt, end - 0.08, end)));
        A.tone(M, t, end, fr, env, pan + side * 0.18);
      }
    });
  };

  // Finger-on-glass: a swelling sine with two soft harmonics, slow vibrato and a breath of tuned noise.
  A.bowed = function (M, noise, t0, t1, f, amp, { pan = 0, swell = 0.5, release = 0.9, vib = 4.6, breath = 0.25 } = {}) {
    const end = t1 + release * 1.5 + 0.1, tau = release / 4.6;
    const env = t => (t < t0 + swell ? amp * clamp((t - t0) / swell) : t < t1 ? amp : amp * Math.exp(-(t - t1) / tau)) * (1 - smooth(prog(t, end - 0.1, end)));
    [[1, 1], [2.0, 0.18], [3.01, 0.05]].forEach(([r, w]) =>
      A.tone(M, t0, end, t => f * r * (1 + 0.0015 * Math.sin(2 * Math.PI * vib * (t - t0))), t => env(t) * w, pan));
    if (breath > 0) {
      const sr = M.sr, i0 = Math.max(0, Math.floor(t0 * sr)), i1 = Math.min(M.n, Math.ceil(end * sr)), len = i1 - i0;
      const off = Math.floor((f % 3) * sr), src = noise[0], x = new Float32Array(len);
      for (let k = 0; k < len; k++) x[k] = src[(k + off) % src.length];
      const y = A.filter(x, sr, 'bandpass', f, 18), P = fnOf(pan);
      for (let k = 0; k < len; k++) { const t = (i0 + k) / sr; add(M, i0 + k, y[k] * breath * 4 * env(t), P(t)); }
    }
  };

  // Water bubble "plink": sine with an exponentially rising pitch and a fast decay.
  A.plink = function (M, t, f, amp, { rise = 1.45, dur = 0.09, pan = 0 } = {}) {
    const end = t + dur * 3 + 0.05;
    A.tone(M, t, end, tt => f * Math.pow(rise, clamp((tt - t) / dur)),
      tt => (tt < t + 0.003 ? amp * (tt - t) / 0.003 : amp * Math.exp(-(tt - t - 0.003) * 3 / dur)) * (1 - smooth(prog(tt, end - 0.03, end))), pan);
  };

  // Render a mix through the shared room: dry + seeded convolution reverb → highpass → glue compressor.
  A.render = async function (M, { seed = 1, room = 3.2, wet = 0.42, bright = 0.5, fade = null } = {}) {
    const ctx = new OfflineAudioContext(2, M.n, M.sr);
    const buf = ctx.createBuffer(2, M.n, M.sr); buf.getChannelData(0).set(M.L); buf.getChannelData(1).set(M.R);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const verbSend = ctx.createGain(); verbSend.gain.value = wet;
    const dry = ctx.createGain(); dry.gain.value = 1 - wet * 0.5;
    const conv = ctx.createConvolver(); conv.normalize = true;
    conv.buffer = A.impulse(ctx, room, seed, { decay: room * 0.9, bright });
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.6;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 2.5; comp.attack.value = 0.02; comp.release.value = 0.35;
    const master = ctx.createGain(); master.gain.value = 1;
    if (fade) { master.gain.setValueAtTime(1, fade[0]); master.gain.linearRampToValueAtTime(0, fade[1]); }
    src.connect(dry).connect(hp);
    src.connect(verbSend).connect(conv).connect(hp);
    hp.connect(comp).connect(master).connect(ctx.destination);
    src.start(0);
    return ctx.startRendering();
  };

  // ---------- in-page mastering: BS.1770 integrated loudness + 4x true-peak limiter ----------
  function biquad(x, b0, b1, b2, a1, a2) {
    const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
    return y;
  }
  function kweight(x, fs) {
    let K = Math.tan(Math.PI * 1681.974450955533 / fs), Q = 0.7071752369554196;
    const Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, 0.4996667741545416);
    let a0 = 1 + K / Q + K * K;
    const s1 = biquad(x, (Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0);
    K = Math.tan(Math.PI * 38.13547087602444 / fs); Q = 0.5003270373238773; a0 = 1 + K / Q + K * K;
    return biquad(s1, 1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0);
  }
  A.loudness = function (chans, fs) {
    const w = chans.map(c => kweight(c, fs)), block = Math.round(0.4 * fs), hop = Math.round(0.1 * fs), z = [];
    for (let s = 0; s + block <= w[0].length; s += hop) {
      let sum = 0;
      for (const c of w) { let m = 0; for (let i = s; i < s + block; i++) m += c[i] * c[i]; sum += m / block; }
      z.push(sum);
    }
    const L = v => -0.691 + 10 * Math.log10(v);
    const abs = z.filter(v => L(v) > -70); if (!abs.length) return -Infinity;
    const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
    const g = abs.filter(v => L(v) > rel);
    return L(g.reduce((a, b) => a + b, 0) / g.length);
  };
  // 4x oversampled sample magnitudes via a Hann-windowed sinc.
  const TAPS = 12, OS = 4, kernel = [];
  for (let ph = 0; ph < OS; ph++) {
    const k = [];
    for (let j = -TAPS; j < TAPS; j++) {
      const x = j - ph / OS; const s = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      k.push(s * (0.5 + 0.5 * Math.cos(Math.PI * x / TAPS)));
    }
    kernel.push(k);
  }
  function truePeakEnvelope(c) { // per-sample max |oversampled| in the neighbourhood
    const n = c.length, out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let m = Math.abs(c[i]);
      for (let ph = 1; ph < OS; ph++) {
        const k = kernel[ph]; let v = 0;
        for (let j = -TAPS; j < TAPS; j++) { const idx = i + j + 1; if (idx >= 0 && idx < n) v += c[idx] * k[j + TAPS]; }
        m = Math.max(m, Math.abs(v));
      }
      out[i] = m;
    }
    return out;
  }
  A.truePeak = function (chans) { let m = 0; for (const c of chans) { const e = truePeakEnvelope(c); for (let i = 0; i < e.length; i++) if (e[i] > m) m = e[i]; } return m; };
  // Normalise to target LUFS, then a lookahead limiter keeps the true peak under ceiling.
  A.master = function (buffer, { lufs = -18, ceiling = -1.7, fadeOut = 0.25 } = {}) {
    const fs = buffer.sampleRate, chans = [0, 1].map(i => buffer.getChannelData(i)), n = chans[0].length;
    const lim = Math.pow(10, ceiling / 20);
    for (let pass = 0; pass < 3; pass++) {
      const L = A.loudness(chans, fs), g = Math.pow(10, (lufs - L) / 20);
      for (const c of chans) for (let i = 0; i < n; i++) c[i] *= g;
      const env = chans.map(truePeakEnvelope), need = new Float32Array(n);
      for (let i = 0; i < n; i++) need[i] = Math.min(1, lim / Math.max(1e-9, env[0][i], env[1][i]));
      // min over the lookahead window → instant-attack / slow-release → box smoothing over the window.
      // The box average of window minima never exceeds the need at any sample, so the ceiling holds.
      const look = Math.round(0.005 * fs), rel = Math.exp(-1 / (0.15 * fs));
      const held = new Float32Array(n);
      let r = 1;
      for (let i = 0; i < n; i++) {
        let m = need[i]; for (let j = 1; j <= look && i + j < n; j++) if (need[i + j] < m) m = need[i + j];
        r = m < r ? m : m + (r - m) * rel; held[i] = r;
      }
      let acc = 0;
      for (let i = 0; i < n; i++) {
        acc += held[i]; if (i > look) acc -= held[i - look - 1];
        const g = acc / Math.min(i + 1, look + 1);
        chans[0][i] *= g; chans[1][i] *= g;
      }
      if (Math.abs(A.loudness(chans, fs) - lufs) < 0.3) break;
    }
    const fo = Math.round(fadeOut * fs);
    for (const c of chans) for (let i = 0; i < fo; i++) c[n - 1 - i] *= i / fo;
    return buffer;
  };

  window.XM = XM;
})();
