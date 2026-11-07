---
name: x-motion-orbit
description: Use with the core x-motion skill when a short film needs the Orbit look of physically lit space, planets, eclipses, machined titanium and a quiet synthesized score.
---

# X Motion · Orbit

Orbit extends `x-motion`; it does not replace it. Run the core method (brief, thesis, storyboard, critique) and use this file for the art direction and the recipes. It was written for 8–12 second, 1920×1080, 30 fps films rendered deterministically from `renderFrame(t)` in headless Chromium with software WebGL.

## Visual thesis

> Space is black, and light is the event. One source (the sun) and the materials it touches: atmosphere, ocean, cloud, metal. Every film is built around the single moment that light arrives, crosses a limb, or breaks free.

Quiet confidence over spectacle. The frame is mostly true black; the subject is a large, slow mass (a planet, a moon, a vault door) and a thin bright edge. If a frame reads as a wallpaper or a game menu, remove things until it reads as a photograph taken by a patient camera.

## Palette

Work in linear HDR and tonemap at the end; these are display-referred targets for what the eye should land on.

| Role | Hex | Use |
| --- | --- | --- |
| True black | `#000000` | 60–80 % of most frames. Never lift it with haze. |
| Void navy | `#050b18` | Deep-space gradient, far from any light. |
| Deep navy | `#0b1a33` | Night ocean, shadowed metal, dark sky after a "lift". |
| Rayleigh blue | `#2f6fd8` | Atmosphere body on the day side. |
| Atmospheric cyan | `#8fd3ff` | Fresnel rim, thin limb line. |
| Sunrise gold | `#ffc46b` | Sun core falloff, terminator, first light on cloud tops. |
| Ember amber | `#ffa448` | City lights (sodium) on the night side. |
| Corona pearl | `#ece8de` | Corona, stars, bell-like highlights. |
| Titanium | `#8a8f96` | Brushed metal body. |
| Nickel | `#c3c6c8` | Metal highlights, bevel flats. |
| Champagne | `#e9d4a6` | Warm specular edge on metal; at most a 2 px line. |
| Aurora green | `#4ff0a0` | Oxygen aurora; keep under 20 % of its full value. |
| H-alpha rose | `#ff4a6e` | Solar prominences and chromosphere only. |

## Light and material

- **One light.** The sun is the only source. Glows, rims and glints must be explained by its position. Cities and aurora are the only emitters, and they live on the night side.
- **Limb darkening** for any star disc: `I(mu) = 1 - 0.6*(1 - mu)` with `mu = sqrt(1 - r*r)`; a gold-to-white core reads hot, a flat disc reads like a sticker.
- **Atmosphere is scattering, not a stroke.** Blue (Rayleigh) on the lit limb, gold where light grazes the terminator, forward-scattered brightness when the sun is behind the planet. The rim is thin: about 1.5 % of the planet radius.
- **Night side** is not black: a cool moonlit fill keeps the ocean deep blue (never olive), land a neutral shade darker, clouds silver-white, a cyan fresnel rim on the disc edge, amber city clusters following coastlines, and a faint green airglow line at the limb. Warm gold appears only where the sun actually reaches.
- **Ocean glint**: a soft specular lobe where the sun reflects, elongated toward the limb; ocean only.
- **Metal**: brushed titanium is anisotropic. Highlights stretch across the brushing direction, bevels catch a thin champagne edge, seams get occlusion. No chrome mirror, no bump-map noise.
- **Lens**: one anamorphic streak (horizontal, thin, cyan-tinted), two to four faint ghosts along the line through frame centre. Ghost opacity under 4 %. Tonemap with an ACES-style curve; never clip a highlight to flat white for more than a few pixels.

## Composition

- Horizons sit on a third, never through the centre. Planet limbs are big arcs (radius 1.5–4 frame heights); a whole small globe looks like a toy.
- The light event (sun crest, diamond ring, first light) lands on a third, not dead centre, unless the shot is about symmetry (a vault door, an eclipse).
- Keep stars sparse (a few hundred visible), sized 1–2 px with soft falloff, slightly warm or cool by temperature. They come out when the frame gets dark and fade when it gets bright, as exposure would.
- No text, logos, HUDs, nebula wallpaper or lens dirt. One subject at a time.

## Motion vocabulary and timing

Verbs: seal, unlatch, part, fall, rise, crest, glide, swallow, unfold, break free, lift. The camera never shakes and rarely cuts; mass moves slowly, light moves fast.

| Beat | Typical length | Curve |
| --- | --- | --- |
| Hold on a sealed or dark frame | 1.0–1.5 s | static, light sweep only |
| Mechanical unlatch | 0.10–0.20 s | fast ease-out, tiny settle |
| Doors parting / fall-through | 0.8–1.4 s | slow start, exponential acceleration |
| Warp (streaks) | 1.2–2.0 s | peak early, decay smoothly to stillness; sparse, frame stays mostly black |
| Planet rise / orbital glide | 3–6 s | long ease-in-out, never linear |
| Sun crest or diamond ring | 0.3–0.6 s to full flare | sharp onset, slow bloom |
| Resolve and hold | ≥ 1.5 s | almost still; let the chord ring |

Motion is computed in closed form from `t`: positions are integrals of authored velocity curves, never accumulated per frame. Warp travel is `s(t) = integral of v`, so streak length is `s(t) - s(t - shutter)`. Keep streaks few (tens per layer, not hundreds), long and soft, with far layers dimmer and thinner than near ones; a dense uniform burst reads as stock hyperspace.

## Sound palette and mix

- **Sub** (30–60 Hz sines with slow swells) carries mass. High-pass the master at about 25 Hz (in JS after rendering; see the audio master recipe).
- **Metal**: modal synthesis. A 5–10 ms band-passed noise click plus 4–6 inharmonic sine partials (for example 1.00, 2.32, 3.86, 5.40 times f0) with decays 0.1–0.8 s.
- **Air and travel**: seeded noise through a moving band-pass, panned with the picture. No stock whooshes.
- **Harmony**: suspended pads (sus2, sus4) under tension; resolve to a major add9 at the light event. Pads are 3 detuned saws per note through a low-pass of 600–1800 Hz.
- **Bells**: additive inharmonic partials (1, 2.0, 2.76, 4.07, 5.4) with a 3–8 ms attack and decays that shorten with partial index.
- **Reverb**: one `ConvolverNode` with a seeded stereo impulse (2.5–4.5 s exponential decay, 20 ms pre-delay, darker tail).
- **Silence is a cue.** Thin the sound when the image goes dark; let the light event own the first loud moment.
- **Targets**: integrated −18 LUFS, true peak ≤ −1.5 dBFS, tail fully decayed 0.3 s before the end. Measure in code, normalise, then limit.

## Technique recipes

**Pipeline.** Software WebGL is slow, so split work: a half-resolution pass renders the smooth HDR scene (planet, atmosphere, corona) into an `RGBA16F` texture; a full-resolution pass upsamples it and adds sharp detail (stars, city lights, flare, metal edges), then tonemaps and dithers. Measure seconds per frame; stay under 1.5 s at 1080p.

**Ray–sphere.** Analytic, no marching for the surface:

```glsl
vec2 sphere(vec3 ro, vec3 rd, float R) {           // t near, t far; t < 0 means miss
  float b = dot(ro, rd), c = dot(ro, ro) - R*R, h = b*b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h); return vec2(-b - h, -b + h);
}
```

**Atmosphere.** Single scattering along the view ray inside the shell (8–12 steps), with the light path's optical depth approximated in 3–4 steps. Rayleigh coefficients `vec3(5.8, 13.5, 33.1)` (scaled to your planet radius), Mie with a Henyey–Greenstein phase `g = 0.76`. Skip pixels whose ray never enters the shell.

**City lights.** Cluster hash noise, masked by land and by night:

```glsl
float night = smoothstep(0.05, -0.15, dot(n, sunDir));
float c = pow(max(fbm3(p*40.0) - 0.45, 0.0)*3.0, 2.0) * land * night;
col += c * vec3(1.0, 0.62, 0.28) * 6.0;           // amber, HDR
```

**Stars, band-limited.** One star per grid cell, jittered; draw with a Gaussian of at least 0.8 px sigma, so motion never strobes:

```glsl
vec2 cell = floor(px / 24.0), f = px - (cell + hash22(cell)) * 24.0;
float star = exp(-dot(f, f) / 1.6) * pow(hash12(cell + 7.1), 18.0) * 3.0;
```

**Sun crest flare.** Everything is analytic around the sun's screen position `s` and its visible fraction `v` (computed in JS):

```glsl
vec2 d = uv - s;
float core = exp(-dot(d, d) * 9000.0), halo = 0.04 / (1.0 + dot(d, d) * 400.0);
float streak = exp(-abs(d.y) * 900.0) * exp(-abs(d.x) * 2.2);
vec3 flare = v * (core * vec3(1.0, .9, .75) * 40.0 + halo * gold + streak * cyan * 2.0);
for (int i = 0; i < 3; i++) { vec2 g = -s * kGhost[i]; /* soft disc at g, 2–4 % */ }
```

**Brushed titanium.** Anisotropic highlight with the tangent along the brushing direction, plus faint band-limited streaks (wavelength ≥ 3 px):

```glsl
float TH = dot(T, H);
float aniso = pow(sqrt(max(1.0 - TH*TH, 0.0)), 60.0);
float grain = 0.92 + 0.08 * noise(vec2(r * 300.0, angle * 3.0));
vec3 metal = base * (0.25 + 0.75 * diffuse) * grain + champagne * aniso;
```

**Eclipse.** Moon slightly larger than the sun (1.04–1.08). Give the lunar limb a little noise so Baily's beads and a diamond ring appear naturally near contact. Corona: brightness `pow(r, -3)` times streamers from noise in (angle, log r), plus fine filaments from high angular frequency, low radial frequency noise.

Write the limb profile once as a sum of integer-frequency sines and wrapped Gaussian notches, then emit it both as JS and as a GLSL string. JS can then integrate the visible photosphere per frame (one bisection per sun-centred ray, about 700 rays), which gives the visible fraction, the bead centroid for the glare and exact contact times for the score. Bead glare needs a log mapping of the fraction, such as `log(1 + f*1e6) / log(1 + 1e6)`. Wide glare drawn from coarse mips shows a staircase on HDR sources, so blur each level with four bilinear taps at half-texel offsets.

**Audio master (deterministic).** After `startRendering()`, measure integrated LUFS (BS.1770 K-weighting and gating) in JS, scale to −18, then run a lookahead peak limiter on 4× oversampled peaks at −1.5 dBFS. Seed every noise buffer and impulse with `mulberry32`.

In headless Chromium these fail a bit-exact repeat test: a stereo signal through a master `BiquadFilterNode` or `DynamicsCompressorNode`, and any node with three or more inputs, because the summation order varies by one ULP. Keep the master bus node-free (gain to destination). Run the high-pass and bus compression in JS after rendering. Bake a reverb's high-pass into its impulse. Chain every fan-in through 2-input gains, since a + b is exact and commutative.

```js
function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
```

## Deterministic checklist

- `renderFrame(t)` sets every uniform from `t` alone; no `Date`, `performance.now`, `Math.random` or per-frame accumulation in render mode.
- Seeded hashes and PRNGs only; the same seed for picture and sound when they must agree.
- Backward seeks reproduce identical pixels; test t = 0 after a late frame.
- `preserveDrawingBuffer: true`, `antialias: false`; call `gl.finish()` at the end of `renderFrame`.
- Preview mode loops with `requestAnimationFrame`; `?render=1` draws nothing on its own.
- `renderAudio` returns the same buffer every call, compared sample by sample across two renders; loudness and true peak are measured, not guessed.
- Inspect stills at the light event, a frame before it and the last frame; check timing per frame.

## Avoid

- Cartoon outlines, glowing strokes around planets, saturated purple nebulae, lens-flare presets with rings of hexagons.
- Spinning globes, fast camera moves, shake, or speed lines without a physical cause.
- Clipping highlights to flat white, lifted blacks, banding (add sub-LSB dither before output).
- Per-frame full-screen grain or 1 px sparkles; they strobe and bloat H.264.
- Sound effects on every motion, cheesy whooshes, risers that go nowhere, clicks at buffer edges, reverb tails cut off by the end of the film.
- Text, logos or interface chrome unless the brief asks for them.
