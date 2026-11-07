---
name: x-motion-prism
description: Use with the core x-motion skill when a film should be about light, glass and colour at rest (refraction, dispersion, caustics, lenses) in a bright paper-white studio, rendered deterministically with a synthesized glassy score.
---

# X Motion: Prism

Prism is a theme for the core `x-motion` method. Follow that method (brief, thesis, storyboard, animatic, production, bounded critique). This file adds the art direction, physics and sound that make the theme recognisable and keep it honest.

## Visual thesis

> Make one optical phenomenon feel precise and quietly miraculous by photographing it like a still life in a pale studio, so the viewer notices how light actually behaves.

- **One hero phenomenon per film.** Dispersion, caustics, a lens image, total internal reflection, a Fresnel edge. Everything else is a calm surface for it to land on.
- **Physics decides where colour goes.** The world is achromatic: paper, stone, graphite. Spectral colour appears only where wavelengths separate (a fan leaving a prism, the fringe of a lens, the rim of a caustic) and nowhere else.
- **Brightness is the mood.** This is the opposite of a dark space theme. Shadows are soft graphite, never black; highlights are light, never neon.
- **The camera is a tripod.** Locked or a barely perceptible push. The phenomenon moves; the observer does not.

## Palette

| Role | Hex | Use |
| --- | --- | --- |
| Paper | `#f2efe9` | Dominant surface, ambient daylight |
| Paper in shade | `#d9d4cb` | Areas outside the key light pool |
| Pale stone | `#e6e1d8` | Floors, pools, plinths (vary ±3% with low-frequency noise) |
| Graphite | `#5d5b57` | Printed lines, contact shadows (at 20–60% opacity) |
| Deep graphite | `#3a3936` | Darkest allowed value, only in contact creases |
| Water tint | `#d8e6e4` | Multiply over stone for shallow clear water |
| Spectrum | computed | Only from a wavelength-to-RGB function, never a hand-picked rainbow |

Work in linear light, add light energies, then tone-map and convert to sRGB once. Additive spectral colour on a bright ground washes out, so lower the ground locally (a soft shaded pool around the hero, around 45–60% linear) where colour must read saturated, and keep the rest of the frame airy.

## Light and material

- **Key light:** one soft daylight source from upper left, about 30–45° off the frame axis. Shadows are long, soft and slightly warm-grey.
- **Glass:** clear, colourless, flawless. Its presence is told by four things only: refraction of what lies behind it, a thin Fresnel rim, one soft window reflection, and the caustic or spectral light it throws. No bevel glows, no tinted glass, no bloom halos.
- **Index of refraction:** Cauchy, `n(λ) = A + B/λ²` with λ in µm. Crown glass: `A = 1.5046, B = 0.0042`. Exaggerate `B` up to about 3× when dispersion must read on screen, and say so in your notes.
- **Paper and stone:** matte, very low-contrast texture (2–4% luminance variation), static in time. Fine print lines are graphite at 1.2–2 px with soft falloff.
- **Contact:** every object touching a surface gets a tight, darker contact shadow plus a broad soft one. This is what makes glass sit rather than float.

## Composition

- Generous negative space: the hero occupies about a third of the frame; the remainder is paper or stone with a gentle light gradient.
- Place the event on a thirds line or the golden point, never dead centre unless the film is about symmetry.
- Lead the eye with light: the beam, the rolling direction or the ripple should travel toward where the payoff will happen.
- Keep the edges of the frame quiet and slightly darker (a 6–10% vignette made from the lighting, not a black ring).
- No text, UI, logos or decorative particles. If the phenomenon needs a scale reference, use a printed grid, a stone joint or a shadow.

## Motion vocabulary and timing

Verbs: *enter, bend, fan, sweep, focus, ripple, settle.* Nouns that move: light, water, a single object. Never the camera and the subject at once.

| Beat | Typical share of a 9–10 s film | Behaviour |
| --- | --- | --- |
| Rest | 10–15% | The empty, lit set. Let the viewer read the surface. |
| Arrival | 15–20% | Light or object enters along a clear path with a decelerating ease. |
| Phenomenon | 35–45% | The hero effect develops and changes slowly (rotate a few degrees, roll, ripple). |
| Settle | 20–25% | Motion decays physically (friction, damping, wave spreading) and holds. |
| Release | 5–8% | Light dims or the image stills so the loop and the audio tail can close. |

- Use physical closed-form motion: constant deceleration for rolling, damped cosines for settling, `1/sqrt(r)` amplitude for spreading rings, eased angles for rotation.
- Light inside glass travels visibly slower than in air when you animate a beam head (`v_glass = v_air / n`). It is a small truth viewers feel.
- Prefer one long gesture over several short ones. A full rotation is too much; 4–10° is enough for a spectrum to sweep.

## Sound palette and mixing

Sound is glass, air and water, tuned. It should feel like a room with hard, clean surfaces.

- **Glass partials:** modal synthesis with a few inharmonic partials (for a struck glass, ratios near `1, 2.32, 4.25, 6.63`), each with its own exponential decay; higher partials die faster.
- **Finger-on-glass:** a sine or two with a slow 0.3–0.6 s swell, 4–5 Hz vibrato at ±0.15% and a whisper of band-passed noise at the same pitch.
- **Air:** pink-ish seeded noise through a band-pass (300–2500 Hz), very low, slowly breathing. It is the room, not wind.
- **Water:** bubble "plinks" are sines whose frequency rises exponentially by about 30–60% over 30–80 ms; soft wash is low-passed noise.
- **Harmony:** pick one key and stay in it (open fifths, added ninths, Lydian colours). Map the phenomenon to pitch: spectrum position to scale degree, speed to filter cutoff, a stop to a resolving chime.
- **Space:** one seeded synthetic convolution reverb (2.5–4.5 s, darkening tail) shared by every voice, dry/wet around 60/40.
- **Targets:** about -18 LUFS integrated, true peak at or below -1.5 dBFS, a 0.3 s fade in, and every tail decayed 0.4 s before the end.

## Technique recipes

**Pure function of time.** Every frame recomputes the whole scene from `t`: object pose, beam head, wave phases. Seeded randomness only.

```js
const mulberry32 = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0;
  let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296; };
```

**Analytic scene, few passes.** Intersect a few analytic shapes (plane, sphere, convex prism as a set of planes) instead of raymarching. Pass time-derived state (angles, positions, ray paths) as uniforms computed in JavaScript. Split the frame into small single-purpose passes (floor, light field at half resolution into an RGBA16F target, glass over the top) rather than one shader with branches.

**Spectral colour from wavelength.** Use a smooth analytic fit so the fan reads as light, not a gradient swatch. Sum several wavelength samples and normalise so the total is neutral white.

```glsl
float gauss(float x, float m, float s) { float u = (x - m) / s; return exp(-u * u); }
vec3 spectral(float nm) {             // smooth fit, linear RGB, visible window 372-712 nm
  float w = smoothstep(372., 392., nm) * (1. - smoothstep(690., 712., nm));
  return w * vec3(gauss(nm, 606., 46.) + 0.14 * gauss(nm, 420., 22.),  // red returns in violet
                  gauss(nm, 543., 44.),
                  gauss(nm, 452., 34.));
}
```

On a bright ground the violet end reads as pale lavender; that is honest, so give it a darker local pool instead of boosting it.

**Refraction per wavelength.** Trace the same ray two or three times with different indices (red, green, blue or more). Where results agree you get crisp neutral detail; where they diverge you get chromatic fringes exactly where physics puts them.

```glsl
vec3 col;
for (int k = 0; k < 3; k++) {
  float n = 1.5046 + B * 3.0 / pow(LAMBDA[k], 2.0);
  col[k] = traceThroughGlass(ro, rd, n)[k];  // refract in, refract out, sample the floor
}
```

**Caustics without simulation.** For a water surface `h(x, t)` built from a few analytic waves, the light reaching the floor below a point scales with `1 / |det(I + d · Hess h)|` where `d` is depth over refractive index. Compute the Hessian analytically (sinusoids and radial ring packets both have closed forms), soften the singularity with `1 / sqrt(det² + ε²)`, and evaluate it with three slightly different `d` for a thin spectral rim.

**Light lines on a plane.** A beam grazing paper is a 1D Gaussian across its axis, `exp(-(dist/w)²)`, plus a wider, fainter glow. Beam heads advance with an eased distance along the path; cut off with a short smoothstep, not a hard edge.

**Band-limited print.** Draw grid lines from distance to the nearest line against the screen-space footprint (`fwidth` of the hit point), so lines stay 1.5–2 px soft at any magnification, including inside a lens. When cells shrink below a few pixels, fade to the print's mean tone, not to blank paper. Give magnified ink a minimum softness (about half its width) or a line under a ball lens becomes a razor-edged wedge.

```glsl
float lines(vec2 p, float s, float w, vec2 fw) {
  vec2 d = abs(fract(p / s + .5) - .5) * s, a = max(fw * .8, vec2(w * .55)), wd = max(vec2(w), a);
  vec2 l = (1. - smoothstep(wd - a, wd + a, d)) * clamp(vec2(w) / wd, 0., 1.);
  return mix(max(l.x, l.y), 4. * w / s, smoothstep(.18, .42, max(fw.x, fw.y) / s));
}
```

**Glass needs something dark to refract.** In a white studio a perfect sphere goes milky. Give the environment grey walls near the horizon, one compact softbox and a dark flag; the inverted horizon and window inside the ball then draw its form. Compute all paths without branches so `fwidth` stays valid, and output analytic coverage (ray-to-centre distance against the radius, in pixels) as alpha.

**Tone and finish.** Exponential shoulder `1 - exp(-1.85 x)` keeps paper near `#f2efe9` while caustic peaks roll off softly; then sRGB. Per-channel shoulders bleach bright spectral bands toward pastel, so for coloured light blend about halfway toward a hue-preserving curve (tone-map the max channel and scale), gated by chroma so paper is untouched. Going fully hue-preserving, or sharpening band colours, collapses orange, yellow and cyan into flat red, green and blue stripes. Check the fan numerically: sample a column across it and confirm hue rises once, from red (about 10°) to violet (about 270°), with no wrap. Add a static sub-LSB dither (±0.6/255) only to break banding in pale gradients; never animate it per frame.

**Speed.** SwiftShader is software rendering and pays for every instruction in a shader, including branches no pixel takes. Keep each pass single-purpose, render soft light fields at half resolution, and scissor expensive passes (glass, prism interiors) to the projected bounding box of the object, blending over the floor with `SRC_ALPHA, ONE_MINUS_SRC_ALPHA`. Measure seconds per frame at 1920×1080 before polishing; fbm at most 5 octaves.

**Deterministic audio graph.** Chromium sums three or more connections into one AudioNode in an unspecified order, so two renders differ by about 1e-6 and fail a byte check. Synthesize every voice in JavaScript into one stereo Float32 mix (phase-accumulated sines, RBJ biquads on seeded noise, sample-exact envelopes), then use the graph only for a single source into a dry gain and a convolver, both into one high-pass (two inputs commute), then a gentle compressor (about 2.5:1, -20 dB threshold) and a linear fade.

```js
const M = A.mix(sr, D);                                   // { L, R } Float32Arrays
A.glass(M, 6.6, hz(81), 0.15, { decay: 2.8, pan: 0.2 }); // modal partials, summed in JS
const buf = await A.render(M, { seed: 31, room: 3.4, wet: 0.45, fade: [8.25, 8.8] });
return A.master(buf, { lufs: -18, ceiling: -1.7 });
```

**Mastering in the page.** After `startRendering()`, measure the buffer (K-weighted, gated integrated loudness and 4× oversampled peak), apply one gain to reach the target and a lower gain if the peak ceiling demands it. Deterministic and simple.

## Deterministic rendering checklist

- `window.motion` declares width, height, duration, fps and a poster time on the most beautiful frame.
- `renderFrame(t)` sets every uniform from `t` alone; no `Date`, `performance.now`, `Math.random`, timers or accumulated state in render mode.
- Seeking late then early reproduces identical pixels; the first and last captured frames are valid.
- Preview mode (no `?render=1`) loops with `requestAnimationFrame`; a click plays the same rendered audio buffer in sync.
- `renderAudio` mixes voices in JavaScript, then renders one source through a seeded convolver in an `OfflineAudioContext`; two calls return byte-identical samples (no node has three or more inputs).
- The cue map is a table of times in code shared by picture and sound (impact, stop, release), and the reverb tail is below -45 dB in the last 0.3 s.
- No network, fonts, images or samples; every texture and sound is procedural.

## Avoid

- Rainbow gradients painted across the frame, rainbow text, iridescent "holographic" surfaces.
- Neon, purple-to-blue "AI" gradients, black backgrounds, lens flares and anamorphic streaks.
- Glossy 3D-render glass: thick bright bevels, tinted glass, HDRI-chrome reflections, bloom on everything.
- Floating objects without contact shadows; colour that does not come from a physical cause.
- Camera orbits, fast cuts, particles, sparkles, whooshes and risers.
- Per-frame random grain and one-pixel lines that strobe after H.264 compression.
- Sounds that clip, chord stacks that fight the key, reverb tails cut off at the end.
