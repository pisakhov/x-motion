// X Motion · Orbit kit. Shared, original helpers for the Orbit films.
// Deterministic WebGL2 two-pass pipeline (half-res HDR scene + full-res composite),
// GLSL noise / atmosphere / tonemap chunks, and a seeded Web Audio studio with
// a BS.1770 loudness meter, normaliser and lookahead true-peak limiter.
'use strict';
(function () {
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lin = (t, a, b) => clamp((t - a) / (b - a));
  const smooth = u => (u = clamp(u), u * u * (3 - 2 * u));
  const smoother = u => (u = clamp(u), u * u * u * (u * (u * 6 - 15) + 10));
  const mix = (a, b, u) => a + (b - a) * u;
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: a => Math.hypot(a[0], a[1], a[2]),
    norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    // rotate vector v about unit axis k by angle a (Rodrigues)
    rot: (v, k, a) => {
      const c = Math.cos(a), s = Math.sin(a), d = V.dot(k, v), x = V.cross(k, v);
      return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)];
    },
  };
  function mulberry32(a) {
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // ---------------------------------------------------------------- GLSL
  const GLSL = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uRes;
uniform float uTime;
out vec4 outColor;
#define PI 3.14159265359
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
vec2 hash22(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
float hash13(vec3 p3){p3=fract(p3*.1031);p3+=dot(p3,p3.zyx+31.32);return fract((p3.x+p3.y)*p3.z);}
vec3 hash33(vec3 p3){p3=fract(p3*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yxz+33.33);return fract((p3.xxy+p3.yxx)*p3.zyx);}
float vnoise2(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x),u.y);}
float vnoise3(vec3 p){vec3 i=floor(p),f=fract(p);vec3 u=f*f*(3.-2.*f);
  float a=hash13(i),b=hash13(i+vec3(1,0,0)),c=hash13(i+vec3(0,1,0)),d=hash13(i+vec3(1,1,0));
  float e=hash13(i+vec3(0,0,1)),g=hash13(i+vec3(1,0,1)),h=hash13(i+vec3(0,1,1)),k=hash13(i+vec3(1,1,1));
  return mix(mix(mix(a,b,u.x),mix(c,d,u.x),u.y),mix(mix(e,g,u.x),mix(h,k,u.x),u.y),u.z);}
float fbm3(vec3 p,int oct){float s=0.,a=.5,n=0.;for(int i=0;i<6;i++){if(i>=oct)break;s+=a*vnoise3(p);n+=a;p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s/n;}
float fbm2(vec2 p,int oct){float s=0.,a=.5,n=0.;for(int i=0;i<6;i++){if(i>=oct)break;s+=a*vnoise2(p);n+=a;p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(3.1,7.7);a*=.5;}return s/n;}
vec2 sphereHit(vec3 ro,vec3 rd,float R){float b=dot(ro,rd),c=dot(ro,ro)-R*R,h=b*b-c;if(h<0.)return vec2(-1.);h=sqrt(h);return vec2(-b-h,-b+h);}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
vec3 srgb(vec3 c){c=clamp(c,0.,1.);return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));}
float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec2 pix(){return (gl_FragCoord.xy-.5*uRes)/uRes.y;}
// static, sub-LSB triangular dither (does not change over time: cheap for H.264)
vec3 dither(vec3 c){float n=hash12(gl_FragCoord.xy)+hash12(gl_FragCoord.xy+71.3)-1.;return c+n/255.*smoothstep(0.,.012,max(c.r,max(c.g,c.b)));}
`;

  // Thin exponential atmosphere around a unit planet. Units: planet radii.
  const ATMO = `
const vec3 BETA_R=vec3(11.8,27.4,67.0);
const float BETA_M=26.0;
const float HR=.0045,HM=.0014;
const float RTOP=1.035;
uniform vec3 uSunDir;
uniform float uSunI;
vec2 dens(vec3 p){float h=length(p)-1.;return exp(-max(h,-.002)/vec2(HR,HM));}
vec3 extinct(vec2 od){return exp(-(BETA_R*od.x+BETA_M*1.11*od.y));}
// Analytic optical depth toward the sun (Chapman-style), with soft planet shadow in .z
vec3 lightDepth(vec3 p,vec3 s){
  float r=length(p),mu=dot(p,s)/r;vec2 H=vec2(HR,HM);
  vec2 x=r/H;vec2 base=H*exp(-(r-1.)/H);
  if(mu>=0.)return vec3(base/(mu+1./sqrt(PI*x*.5)),1.);
  float r0=r*sqrt(1.-mu*mu);vec2 x0=r0/H;
  vec2 od=2.*H*exp(-(max(r0,.995)-1.)/H)*sqrt(PI*x0*.5)-base/(-mu+1./sqrt(PI*x*.5));
  return vec3(max(od,0.),smoothstep(.996,1.002,r0));
}
float phaseR(float m){return .0596831*(1.+m*m);}
float phaseM(float m){const float g=.76;float k=1.+g*g-2.*g*m;return .0795775*(1.-g*g)/(k*sqrt(k));}
// single scattering along ro+rd*[0,tmax]; returns inscatter, writes view transmittance
vec3 atmo(vec3 ro,vec3 rd,float tmax,out vec3 trans){
  trans=vec3(1.);
  vec2 ta=sphereHit(ro,rd,RTOP);
  if(ta.y<0.)return vec3(0.);
  float t0=max(ta.x,0.),t1=min(ta.y,tmax);
  if(t1<=t0)return vec3(0.);
  float tc=clamp(-dot(ro,rd),t0,t1);
  vec2 od=vec2(0.);vec3 sR=vec3(0.),sM=vec3(0.);
  const int N=7;
  for(int side=0;side<2;side++){
    float a=side==0?tc:tc, L=side==0?(tc-t0):(t1-tc);
    float sg=side==0?-1.:1.;
    if(L<=1e-6)continue;
    for(int i=0;i<N;i++){
      float u0=float(i)/float(N),u1=float(i+1)/float(N);
      float q0=u0*u0,q1=u1*u1;float um=.5*(q0+q1);
      float dt=(q1-q0)*L;
      vec3 p=ro+rd*(a+sg*um*L);
      vec2 d=dens(p)*dt;od+=d;
      vec3 l=lightDepth(p,uSunDir);
      vec3 T=extinct(od+l.xy)*l.z;
      sR+=d.x*T;sM+=d.y*T;
    }
  }
  trans=extinct(od);
  float m=dot(rd,uSunDir);
  return uSunI*(sR*BETA_R*phaseR(m)+sM*BETA_M*phaseM(m));
}
`;

  // ---------------------------------------------------------------- WebGL
  const VS = `#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}`;

  function compile(gl, vsSrc, fsSrc) {
    const mk = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`);
        const m = /ERROR: \d+:(\d+)/.exec(log);
        const at = m ? lines.slice(Math.max(0, m[1] - 3), +m[1] + 2).join('\n') : '';
        throw new Error('Shader compile failed: ' + log + '\n' + at);
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vsSrc)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link failed: ' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name.replace(/\[0\]$/, '')] = { loc: gl.getUniformLocation(p, info.name), type: info.type };
    }
    return { p, u };
  }
  function setUniforms(gl, prog, values) {
    for (const [name, v] of Object.entries(values)) {
      const e = prog.u[name]; if (!e) continue;
      switch (e.type) {
        case gl.FLOAT: Array.isArray(v) || ArrayBuffer.isView(v) ? gl.uniform1fv(e.loc, v) : gl.uniform1f(e.loc, v); break;
        case gl.FLOAT_VEC2: gl.uniform2fv(e.loc, v); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(e.loc, v); break;
        case gl.FLOAT_VEC4: gl.uniform4fv(e.loc, v); break;
        case gl.FLOAT_MAT3: gl.uniformMatrix3fv(e.loc, false, v); break;
        case gl.INT: case gl.SAMPLER_2D: case gl.BOOL: gl.uniform1i(e.loc, v); break;
        default: throw new Error('Unsupported uniform type for ' + name);
      }
    }
  }

  // film({ duration, poster, sceneScale, scene, composite, uniforms(t), score(S) })
  function film(cfg) {
    const W = 1920, H = 1080, D = cfg.duration;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    document.body.appendChild(canvas);
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    const floatOK = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    const passes = [];
    let scene = null;
    if (cfg.scene) {
      const s = cfg.sceneScale || 0.5, w = Math.round(W * s), h = Math.round(H * s);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      const levels = 1 + Math.floor(Math.log2(Math.max(w, h)));
      gl.texStorage2D(gl.TEXTURE_2D, levels, floatOK ? gl.RGBA16F : gl.RGBA8, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Scene framebuffer incomplete');
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      scene = { tex, fbo, w, h, prog: compile(gl, VS, cfg.scene) };
    }
    const comp = compile(gl, VS, cfg.composite);
    const vao = gl.createVertexArray();

    function renderFrame(t) {
      t = Number.isFinite(t) ? clamp(t, 0, D) : 0;
      const u = cfg.uniforms(t);
      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
      if (scene) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
        gl.viewport(0, 0, scene.w, scene.h);
        gl.useProgram(scene.prog.p);
        setUniforms(gl, scene.prog, { ...u, uRes: [scene.w, scene.h], uTime: t });
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindTexture(gl.TEXTURE_2D, scene.tex);
        gl.generateMipmap(gl.TEXTURE_2D);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(comp.p);
      if (scene) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, scene.tex); }
      setUniforms(gl, comp, { ...u, uRes: [W, H], uTime: t, uScene: 0, uSceneRes: scene ? [scene.w, scene.h] : [W, H] });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.finish();
    }

    window.motion = { width: W, height: H, duration: D, fps: 30, poster: cfg.poster };
    window.renderFrame = renderFrame;
    window.renderAudio = async ({ sampleRate = 48000 } = {}) => {
      const ctx = new OfflineAudioContext(2, Math.ceil(D * sampleRate), sampleRate);
      await deterministicGraph(ctx, async () => cfg.score(studio(ctx, D)));
      const buf = await ctx.startRendering();
      return finalize(buf, cfg.loudness ?? -18, -1.7, D);
    };

    const params = new URLSearchParams(location.search);
    if (params.get('render') !== '1') preview(D, renderFrame, cfg.poster);
  }

  function preview(D, renderFrame, poster) {
    let audio = null, t0 = performance.now();
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.body.style.cursor = 'pointer';
    document.body.title = 'Click to play with sound';
    document.addEventListener('click', async () => {
      if (audio) { audio.ac.close(); audio = null; t0 = performance.now(); return; }
      const ac = new AudioContext();
      const buf = await window.renderAudio({ sampleRate: ac.sampleRate });
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; src.loopEnd = D;
      src.connect(ac.destination);
      const start = ac.currentTime + 0.05; src.start(start);
      audio = { ac, start };
    });
    const loop = () => {
      const t = still ? poster : audio ? ((audio.ac.currentTime - audio.start) % D + D) % D : ((performance.now() - t0) / 1000) % D;
      renderFrame(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- Audio
  // Chromium sums a node's inputs in an order that can change between runs, so a node with three or
  // more inputs is not bit-exact. While the graph is built, every fan-in is rerouted through a chain
  // of two-input GainNodes (a + b is exact and commutative); each chain is joined to its target last.
  async function deterministicGraph(ctx, build) {
    const raw = AudioNode.prototype.connect, fan = new Map();
    AudioNode.prototype.connect = function (dest, ...rest) {
      if (!(dest instanceof AudioNode) || rest.length || this.context !== ctx) return raw.call(this, dest, ...rest);
      const e = fan.get(dest);
      if (!e) fan.set(dest, { tip: this });
      else { const j = ctx.createGain(); raw.call(e.tip, j); raw.call(this, j); e.tip = j; }
      return dest;
    };
    try { await build(); } finally { AudioNode.prototype.connect = raw; }
    for (const [dest, e] of fan) raw.call(e.tip, dest);
  }
  function studio(ctx, D) {
    const sr = ctx.sampleRate;
    const master = ctx.createGain();
    // The 24 Hz high-pass and bus compression run in finalize() (plain JS, bit-exact). In headless
    // Chromium a stereo signal through a master BiquadFilterNode or DynamicsCompressorNode rendered
    // slightly differently on repeat runs, so the master bus stays node-free.
    master.connect(ctx.destination);

    const cache = new Map();
    function noiseBuf(seconds, seed, color = 'white', channels = 1) {
      const key = `${seconds}|${seed}|${color}|${channels}`;
      if (cache.has(key)) return cache.get(key);
      const n = Math.max(1, Math.ceil(seconds * sr)), b = ctx.createBuffer(channels, n, sr);
      for (let c = 0; c < channels; c++) {
        const r = mulberry32(seed * 7919 + c * 104729 + 1), d = b.getChannelData(c);
        let b0 = 0, b1 = 0, b2 = 0, br = 0;
        for (let i = 0; i < n; i++) {
          const w = r() * 2 - 1;
          if (color === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
          else if (color === 'brown') { br = (br + 0.02 * w) / 1.02; d[i] = br * 3.5; }
          else d[i] = w * 0.5;
        }
      }
      cache.set(key, b); return b;
    }
    // Seeded stereo impulse: exponential decay with progressive darkening and early reflections.
    function impulse(seconds, seed, { decay = 3, pre = 0.02, dark = 0.5 } = {}) {
      const n = Math.ceil(seconds * sr), b = ctx.createBuffer(2, n, sr);
      for (let c = 0; c < 2; c++) {
        const r = mulberry32(seed * 31 + c * 977 + 5), d = b.getChannelData(c);
        let lp = 0; const p = Math.floor(pre * sr);
        for (let i = p; i < n; i++) {
          const tt = (i - p) / sr;
          const env = Math.exp(-6.9 * tt / decay) * Math.min(1, tt / 0.004);
          const k = Math.min(0.97, 0.15 + dark * tt / decay * 1.6);
          lp = lp * k + (r() * 2 - 1) * (1 - k);
          d[i] = lp * env * (1 + 2 * k);
        }
        for (let e = 0; e < 7; e++) { const at = p + Math.floor((0.006 + r() * 0.05) * sr); if (at < n) d[at] += (r() - 0.5) * 0.6 * Math.exp(-e * 0.3); }
        for (let i = n - 256; i < n; i++) d[i] *= (n - i) / 256;
      }
      // the 140 Hz high-pass lives in the impulse (LTI, so equivalent to filtering the send)
      highpass([b.getChannelData(0), b.getChannelData(1)], sr, 140, 0.7);
      return b;
    }
    function reverb(seconds, seed, opts = {}, wet = 0.4) {
      const cv = ctx.createConvolver(); cv.normalize = true; cv.buffer = impulse(seconds, seed, opts);
      const inp = ctx.createGain(), g = ctx.createGain(); g.gain.value = wet;
      inp.connect(cv); cv.connect(g); g.connect(master);
      return inp;
    }
    // Automation from [[t, v], ...]; 'e' third element = exponential approach.
    function automate(param, pts) {
      param.setValueAtTime(pts[0][1], Math.max(0, pts[0][0]));
      for (let i = 1; i < pts.length; i++) {
        const [t, v, k] = pts[i];
        if (k === 'e') param.exponentialRampToValueAtTime(Math.max(v, 1e-5), t);
        else param.linearRampToValueAtTime(v, t);
      }
    }
    // Raised-cosine curve through points (smooth, click-free gains).
    function curve(param, pts, steps = 64) {
      const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
      const n = Math.max(2, Math.ceil((t1 - t0) * steps)), arr = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = t0 + (t1 - t0) * i / (n - 1);
        let j = 0; while (j < pts.length - 2 && t > pts[j + 1][0]) j++;
        const [a, va] = pts[j], [b, vb] = pts[j + 1];
        const u = b > a ? clamp((t - a) / (b - a)) : 1;
        arr[i] = va + (vb - va) * (0.5 - 0.5 * Math.cos(Math.PI * u));
      }
      param.setValueCurveAtTime(arr, t0, t1 - t0);
    }
    function panner(p, dest) { const s = ctx.createStereoPanner(); s.pan.value = p; s.connect(dest); return s; }
    function osc(type, f, t0, t1, dest, detune = 0) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
      o.connect(dest); o.start(t0); o.stop(t1); return o;
    }
    // Additive bell/chime: partials [[ratio, amp, decaySeconds], ...]
    function bell({ t, f, amp = 0.2, pan = 0, partials, attack = 0.004, send = null, sendAmt = 0.5, dur }) {
      const out = ctx.createGain(); out.gain.value = amp; const pn = panner(pan, master); out.connect(pn);
      if (send) { const sg = ctx.createGain(); sg.gain.value = sendAmt; out.connect(sg); sg.connect(send); }
      for (const [ratio, a, dec, det = 0] of partials) {
        const g = ctx.createGain(); g.gain.value = 0; g.connect(out);
        const end = t + (dur ?? dec * 7);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + attack);
        g.gain.setTargetAtTime(0, t + attack, dec);
        g.gain.setValueAtTime(0, end - 0.001);
        osc('sine', f * ratio, t, end, g, det);
      }
      return out;
    }
    // Pad: detuned saws per note through a moving low-pass.
    function pad({ notes, env, cutoff, q = 0.5, amp = 0.08, spread = 0.6, detune = 7, send = null, sendAmt = 0.6, voices = 3 }) {
      const t0 = env[0][0], t1 = env[env.length - 1][0];
      const bus = ctx.createGain(); curve(bus.gain, env.map(([t, v]) => [t, v * amp]));
      bus.connect(master);
      if (send) { const sg = ctx.createGain(); sg.gain.value = sendAmt; bus.connect(sg); sg.connect(send); }
      notes.forEach((f, i) => {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = q; automate(lp.frequency, cutoff);
        const pan = notes.length > 1 ? (i / (notes.length - 1) * 2 - 1) * spread : 0;
        lp.connect(panner(pan, bus));
        for (let v = 0; v < voices; v++) {
          const d = (v - (voices - 1) / 2) * detune + (i % 2 ? 1.3 : -1.1);
          const g = ctx.createGain(); g.gain.value = 1 / voices; g.connect(lp);
          osc('sawtooth', f, t0, t1 + 0.05, g, d);
        }
      });
      return bus;
    }
    // Seeded noise through a filter with automated frequency, gain and pan.
    function noise({ t0, t1, seed, color = 'white', type = 'bandpass', freq, q = 1, gain, pan = [[t0, 0]], send = null, sendAmt = 0.4, dest = master }) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf(t1 - t0 + 0.1, seed, color);
      const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; automate(f.frequency, freq);
      const g = ctx.createGain(); curve(g.gain, gain);
      const p = ctx.createStereoPanner(); automate(p.pan, pan);
      src.connect(f); f.connect(g); g.connect(p); p.connect(dest);
      if (send) { const sg = ctx.createGain(); sg.gain.value = sendAmt; g.connect(sg); sg.connect(send); }
      src.start(t0); src.stop(t1 + 0.05);
      return { src, f, g, p };
    }
    return { ctx, sr, D, master, noiseBuf, impulse, reverb, automate, curve, panner, osc, bell, pad, noise, mulberry32 };
  }

  // BS.1770-4 integrated loudness (LUFS) + 4x oversampled true peak (dBTP).
  function kWeight(x, sr) {
    const out = new Float64Array(x.length);
    const biq = (inp, o, b0, b1, b2, a1, a2) => {
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < inp.length; i++) { const x0 = inp[i]; const y = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x0; y2 = y1; y1 = y; o[i] = y; }
    };
    let K = Math.tan(Math.PI * 1681.974450955533 / sr), Q = 0.7071752369554196;
    const Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, 0.4996667741545416);
    let a0 = 1 + K / Q + K * K;
    const tmp = new Float64Array(x.length);
    biq(x, tmp, (Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0);
    K = Math.tan(Math.PI * 38.13547087602444 / sr); Q = 0.5003270373238773; a0 = 1 + K / Q + K * K;
    biq(tmp, out, 1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0);
    return out;
  }
  function loudness(chans, sr) {
    const kw = chans.map(c => kWeight(c, sr));
    const block = Math.round(0.4 * sr), step = Math.round(0.1 * sr), z = [];
    for (let s = 0; s + block <= kw[0].length; s += step) {
      let sum = 0;
      for (const c of kw) { let m = 0; for (let i = s; i < s + block; i++) m += c[i] * c[i]; sum += m / block; }
      z.push(sum);
    }
    const L = v => -0.691 + 10 * Math.log10(v);
    const abs = z.filter(v => L(v) > -70);
    if (!abs.length) return -Infinity;
    const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
    const g = abs.filter(v => L(v) > rel);
    return L(g.reduce((a, b) => a + b, 0) / g.length);
  }
  const TAPS = 12;
  const PHASE = [0.25, 0.5, 0.75].map(ph => {
    const k = [];
    for (let j = -TAPS + 1; j <= TAPS; j++) { const x = j - ph; const w = 0.5 + 0.5 * Math.cos(Math.PI * x / (TAPS + 1)); k.push(x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x) * w); }
    return k;
  });
  // per-sample true peak magnitude (max over the sample and 3 interpolated points after it)
  function peakEnvelope(c) {
    const n = c.length, pk = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let m = Math.abs(c[i]);
      for (const k of PHASE) { let s = 0; for (let j = 0; j < k.length; j++) { const idx = i + j - TAPS + 1; if (idx >= 0 && idx < n) s += c[idx] * k[j]; } if (Math.abs(s) > m) m = Math.abs(s); }
      pk[i] = m;
    }
    return pk;
  }
  function truePeak(chans) { let m = 0; for (const c of chans) { const p = peakEnvelope(c); for (let i = 0; i < p.length; i++) if (p[i] > m) m = p[i]; } return 20 * Math.log10(m || 1e-9); }
  function limit(chans, sr, ceilingDb) {
    const ceil = Math.pow(10, ceilingDb / 20), n = chans[0].length;
    const req = new Float32Array(n).fill(1);
    for (const c of chans) { const p = peakEnvelope(c); for (let i = 0; i < n; i++) if (p[i] > ceil) req[i] = Math.min(req[i], ceil / p[i]); }
    const L = Math.max(1, Math.round(0.003 * sr)), rel = 1 - Math.exp(-1 / (0.12 * sr));
    const m = new Float32Array(n);
    for (let i = 0; i < n; i++) { let v = 1; for (let j = i; j < Math.min(n, i + L + 1); j++) if (req[j] < v) v = req[j]; m[i] = v; }
    let acc = 0; const box = new Float32Array(n);
    for (let i = 0; i < n; i++) { acc += m[i]; if (i >= L) acc -= m[i - L]; box[i] = i >= L - 1 ? acc / L : Math.min(...m.slice(0, i + 1)); box[i] = Math.min(box[i], m[i]); }
    let g = 1;
    for (let i = 0; i < n; i++) { const o = box[i]; g = o < g ? o : g + (o - g) * rel; for (const c of chans) c[i] *= g; }
  }
  // Gentle linked-stereo bus compressor: RMS detector, soft knee, 2:1 above -20 dBFS.
  function compress(chans, sr, { threshold = -20, ratio = 2, knee = 10, attack = 0.03, release = 0.4 } = {}) {
    const n = chans[0].length, ca = Math.exp(-1 / (attack * sr)), cr = Math.exp(-1 / (release * sr)), cd = Math.exp(-1 / (0.01 * sr));
    let ms = 0, gr = 0;
    for (let i = 0; i < n; i++) {
      let p = 0; for (const c of chans) p = Math.max(p, c[i] * c[i]);
      ms = cd * ms + (1 - cd) * p;
      const lv = 10 * Math.log10(ms + 1e-12), over = lv - threshold;
      let red = 0;
      if (over > knee / 2) red = over * (1 - 1 / ratio);
      else if (over > -knee / 2) red = (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee);
      gr = red > gr ? ca * gr + (1 - ca) * red : cr * gr + (1 - cr) * red;
      const g = Math.pow(10, -gr / 20); for (const c of chans) c[i] *= g;
    }
  }
  // 2nd-order Butterworth-ish high-pass (RBJ), applied in place.
  function highpass(chans, sr, f0 = 24, q = 0.6) {
    const w = 2 * Math.PI * f0 / sr, al = Math.sin(w) / (2 * q), cw = Math.cos(w), a0 = 1 + al;
    const b0 = (1 + cw) / 2 / a0, b1 = -(1 + cw) / a0, b2 = b0, a1 = -2 * cw / a0, a2 = (1 - al) / a0;
    for (const c of chans) {
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < c.length; i++) { const x0 = c[i], y = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x0; y2 = y1; y1 = y; c[i] = y; }
    }
  }
  function finalize(buf, target, ceilingDb, D) {
    const sr = buf.sampleRate, chans = [];
    for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
    highpass(chans, sr);
    compress(chans, sr);
    // click-safe edges: 20 ms fade in, 60 ms fade out
    const fi = Math.round(0.02 * sr), fo = Math.round(0.06 * sr), n = chans[0].length;
    for (const c of chans) { for (let i = 0; i < fi; i++) c[i] *= i / fi; for (let i = 0; i < fo; i++) c[n - 1 - i] *= i / fo; }
    for (let pass = 0; pass < 3; pass++) {
      const l = loudness(chans, sr);
      if (!Number.isFinite(l)) break;
      const g = Math.pow(10, (target - l) / 20);
      if (Math.abs(target - l) < 0.05 && pass) break;
      for (const c of chans) for (let i = 0; i < n; i++) c[i] *= g;
      limit(chans, sr, ceilingDb);
    }
    buf.stats = { lufs: loudness(chans, sr), truePeak: truePeak(chans) };
    return buf;
  }

  window.OrbitKit = { TAU, clamp, lin, smooth, smoother, mix, V, mulberry32, GLSL, ATMO, film, studio, finalize, loudness, truePeak };
})();
