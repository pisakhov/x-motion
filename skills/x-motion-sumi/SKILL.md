---
name: x-motion-sumi
description: Use with the core x-motion skill when a film should look and sound like ink-wash painting in motion (paper, carbon ink, water, mist, breath, one vermilion accent).
---

# X Motion: Sumi

Ink, paper, breath. This theme translates the material logic of ink-wash painting into time: carbon ink diluted through many greys, warm fibrous paper, wet edges that bleed, dry bristles that skip, and emptiness as the main material. It extends `x-motion`; run that method first (brief, thesis, storyboard, critique loop) and use this file for the art direction and the recipes.

## Visual thesis

> Make one gesture at a time feel inevitable through ink behaving like ink (diffusing, bleeding, running dry) on a large field of quiet paper, so the viewer feels the stillness before and after the decisive moment.

- **One gesture per beat.** A drop, a stroke, a ridge, a bird. Never two focal events at once.
- **Emptiness carries weight.** 60 to 80 percent of the frame stays untouched paper, mist or water. Empty space is composed, not leftover.
- **Material truth over illustration.** The look comes from simulating how ink absorbs light and paper absorbs ink, not from outlines or flat fills.
- **Respect and originality.** No calligraphy, no pseudo-script, no real or fake characters, no costume, temple or lantern props, no red-sun-plus-crane emblem. Seals are abstract geometric marks.

## Palette

Work in linear light; these are sRGB hex anchors.

| Role | Hex | Notes |
| --- | --- | --- |
| Paper (lit) | `#f1e9d8` | Warm washi; never pure white |
| Paper (shade) | `#e0d3ba` | Vignette, fold of light, mottling |
| Paper (deep) | `#cbbb9c` | Only at frame edges or in fog shadows |
| Ink, full strength | `#14120f` | Warm carbon; never `#000` |
| Ink, mid wash | `#5d5b57` | Slightly cool against warm paper |
| Ink, pale wash | `#a9a69f` | Far mountains, diffused clouds |
| Vermilion | `#c8372d` | The only colour. At most one mark, at most about 1.5 percent of pixels |
| Vermilion in haze | `#d7735f` | Vermilion mixed toward paper by atmosphere |

Ink is not a colour you paint; it is an absorption. Composite with Beer-Lambert: `rgb = paper * exp(-density * absorb)`, with `absorb` slightly larger in blue (for example `vec3(1.0, 1.04, 1.1)`) so thin washes read faintly cool and dense ink reads warm black.

## Light and material

- **Paper** is lit softly from one side: low-frequency mottling (plus or minus 3 percent), visible kozo fibres (long thin translucent strands, 1 to 2 px wide), and a fine tooth that dry ink catches on. Bake it once; it is static.
- **Wet ink** has a darker rim where pigment migrated to the edge, a feathered bleed into fibres, and a faint sheen that fades as it dries.
- **Dry ink** breaks into parallel bristle lanes and skips the paper's low points (threshold the tooth).
- **Ink in water** is a backlit volume: dense cores, laminar sheets seen edge-on as fine dark lines, and a soft veil around everything.
- **Atmosphere** is paper-coloured. Distance and mist lift values toward paper, never toward blue or white.

## Composition

- Place the subject on an asymmetric third; leave one large calm region (top or one side) as the counterweight.
- Keep a clear value hierarchy: one near-black, a few mid greys, everything else paper.
- Edges of the frame stay quiet. A soft vignette toward `#e0d3ba` holds the eye inside.
- The vermilion accent sits far from the main mass, small, low and late. It answers the gesture; it does not compete.
- Check the thumbnail: the silhouette of the one gesture must read at 320 px wide.

## Motion vocabulary and timing

| Verb | Character | Typical curve |
| --- | --- | --- |
| Breathe (hold) | Nothing moves but light or mist | 0.8 to 1.5 s of stillness before the gesture |
| Fall / strike | Decisive, fast, no overshoot | ease-in, 0.3 to 0.6 s |
| Draw | Brush accelerates then releases | slow press, fast middle, light lift |
| Bloom / diffuse | Fast then exponential slow-down | `1 - exp(-t / tau)`, tau 1 to 2 s |
| Bleed / settle | Tiny growth after the event | `sqrt` of time since contact, capped |
| Drift | Camera or mist, constant and slow | linear or very long ease, under 2 percent of frame per second |
| Dissolve | Contrast falls, edges widen | 2 to 3 s at the end, never a cut to black |

- Rhythm is breath: stillness, one decisive event, a long settle. Do not fill the settle with new events.
- Camera moves only to follow the gesture (sinking with ink, gliding through mist). Push-ins stay under 8 percent.
- Seeds and noise fields evolve slowly: field offsets under 0.05 units per second, or they read as boiling.

## Sound palette and mix

Sound is as sparse as the image. Silence is a cue.

- **Materials:** breath (bandpassed noise with a slow filter sweep), water (a rising sine chirp for a drop, muffled bubbles), paper and brush (bandpassed noise with sparse grain clicks that grow as the brush runs dry), wind (two decorrelated noise beds with seeded gust curves).
- **Instruments:** breathy end-blown flute (sine plus a little 2nd and 3rd harmonic, pitch scooped up from below, breath noise band-locked to the note), plucked string (Karplus-Strong rendered to a buffer, optional pitch slide after the pluck), low gong (inharmonic partials with beating pairs, low partials ring longest).
- **Harmony:** a few notes with open intervals (fourths, fifths, ninths). Avoid stock "oriental" pentatonic riffs; let single notes speak.
- **Space:** one long synthetic reverb (3 to 5 s, darkening tail, 20 to 40 ms predelay). Instruments wet, textures drier.
- **Sync:** the drop sound meets impact; breath leads a gesture by 0.3 to 0.8 s; the gong meets the seal; melodic notes follow visual events by 0.1 to 0.3 s.
- **Targets:** about -18 LUFS integrated, true peak at or below -1.5 dBFS, tail under -60 dBFS by the last frame, no clicks (every gain change ramps over at least 5 ms).

## Technique recipes

**1. Bake noise and paper once.** Upload a tileable 256x256 RGBA16F texture: RG holds a curl field (the rotated gradient of a periodic gradient noise), BA hold two independent noises. Bake the paper with seeded JS (grain plus Canvas 2D fibre strokes) into an RGBA8 texture with mipmaps; sample it every frame instead of computing fbm per pixel.

**2. Ink composite (linear light).**

```glsl
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 inkOver(vec3 paperLin, float density){
  return paperLin * exp(-density * vec3(3.4, 3.55, 3.75));
}
```

**3. Ink in water by inverse advection.** Do not simulate. Describe the ink as a few analytic primitives (drop, stem, vortex ring, petal lobes) whose positions are closed-form functions of time, then evaluate them at a warped coordinate. The warp is a few steps along a curl field with amplitude growing with time since impact, which stretches primitives into curling tendrils.

```glsl
vec2 q = p;
for (int i = 0; i < 4; i++) {
  vec2 c = texture(uNoise, q * freq[i] + drift * t).rg;   // curl field
  q += amp[i] * growth * c;
}
float dens = primitives(q, t);              // gaussian cores + wide veil
dens += sheet(q) * veil;                     // ridged noise: edge-on sheets
```

- Keep the warp low-frequency (base scale 1 to 3 cycles per frame height, a weak third octave). High-frequency warp turns ink into wriggling worms.
- Roll-up comes from a local swirl (rotate `q` around each vortex core by an angle that falls off as a gaussian), not from more noise.
- Petals, lobes and veils need soft rims (gaussian, width 0.2 to 0.3 of the radius). Thin dark contour lines inside a shape read as a topographic map.
- Judge the silhouette, not the detail: a radial five-lobe shape seen head-on reads as a jellyfish or starfish. Tilt it (project 3D lobes for a camera looking down about 30 degrees) before it reads as a flower.
- A trail that stays thin, sharp and opaque reads as a string or stem. Treat it as a wake: widen it, soften it, curl it and fade it within about a second, top first, so the form stands alone.
- Absorb ink cores with a warm coefficient (more blue than red, for example `vec3(3.2, 3.6, 4.2)`) and diluted edges with a neutral one. Then the cores read as sumi black, not flat grey.

**4. Brush stroke as a polar field.** For an ensō, use `r(theta) = R + wobble(theta)`. Per pixel take the angle, convert it to stroke progress `u` and the signed distance across the stroke `d / width(u)`. Reveal where `u < brushHead(t)`. Wetness, width and dryness are functions of `u`; bleed is a function of `t - timeTheBrushPassed(u)`.

```glsl
float lanes = texture(uNoise, vec2(across * 5.0, u * 0.35)).b;   // bristle lanes
float dryInk = step(dryness(u), lanes * 0.6 + tooth * 0.5);         // skips low paper
float rim = smoothstep(0.75, 1.0, abs(across)) * wet(u);            // edge darkening
```

**5. Layered depth for landscapes.** Each ridge is a 1D height profile at depth `z`. Per pixel, project to world x, look up the height, compare with the screen y of that height under perspective. Ink is strongest at the ridge line and falls off downward into mist. Composite far to near, mixing toward paper by `1 - exp(-depth * k)`. Fog sheets sit in the valleys between ridges and drift with time. Fade a ridge out when the camera is about to pass through it.

- Composite near to far with transmittance (`acc += T * a * layer; T *= 1.0 - a;`) and break once `T` is nearly zero. This is exact, and it halves the cost because the lower frame stops after one or two layers.
- Compute ridge lines with analytic 1D gradient noise (hash plus quintic fade), not texture lookups: bilinear texels show as kinks along a long crest.
- Atmosphere needs a steep curve (`exp(-0.45 * depth)`) before the farthest range reads as a pale ghost rather than one more grey.

**6. Small silhouettes** (a bird, a seal) as SDF capsules and boxes inside a bounding box test, with an anti-aliased edge of 1.5 px. Animate wings with a phase function, not with physics.

**7. Audio building blocks.**

```js
// Karplus-Strong pluck with optional glide, rendered deterministically to a buffer
for (let n = 0; n < len; n++) {
  const d = sr / freqAt(n) - 0.5, r = w - d;
  const a = read(r), b = read(r - 1);
  y = exc[n] + g * 0.5 * (a + b); write(y); out[n] = y;
}
```

Reverb impulse: seeded stereo noise times `exp(-t / decay)` through a one-pole lowpass whose cutoff falls over time. Master chain: gentle compressor (ratio 2 to 3), then a fast high-ratio compressor as a limiter, then a measured make-up gain, then a linear master fade that reaches zero about 0.15 s before the end so the reverb tail is gone.

- **Bit-exact mixing.** Chromium sums a node's inputs in an unspecified order. Float addition only gives the same bits for two operands, and the compressors amplify the 1e-7 rounding into audible-level differences between calls. Give every mix point at most two inputs by chaining gain nodes:

```js
function summer(ctx, target) {        // returns add(node); each mix point gets <= 2 inputs
  let open = target, count = 0;
  return node => { if (count === 1) { const j = ctx.createGain(); j.connect(open); open = j; count = 0; } node.connect(open); count++; };
}
```

- `DynamicsCompressorNode` applies its own automatic make-up gain, so lowering the threshold makes the mix louder. Set the loudness with the output gain instead.
- Check the balance of the stems: render once without the melody. If the bed alone is within 2 dB of the full mix, the melody is buried.

## Deterministic rendering checklist

- `renderFrame(t)` sets every uniform from `t` alone; no accumulation, `Date`, `performance.now`, or `Math.random`.
- All randomness comes from a seeded PRNG (mulberry32) or texture hashes baked at load.
- Paper, noise and IR are built synchronously at load and never change.
- Backward seek gives identical pixels; test `t = 0` after a late frame.
- Frame cost measured at 1920x1080 in software WebGL; stay under 1.5 s. Use bounding boxes for small details and keep warp loops to four steps.
- Grain is static, under 2 percent; no per-frame full-screen noise.
- Lines and filaments have at least a 1.5 px soft falloff.
- Audio uses seeded noise buffers, and every mix point has at most two inputs; two calls must return byte-identical buffers.
- Preview mode loops with `requestAnimationFrame`; render mode draws nothing on its own.

## Avoid

- Pure white paper, pure black ink, saturated colour beyond the single vermilion mark.
- Script-like strokes, characters, faux calligraphy, signatures, stock cultural props.
- Several gestures competing; busy backgrounds; ink that moves constantly at the same speed.
- Glow, lens flares, chromatic aberration, bokeh; ink is matte.
- Uniform blur pretending to be diffusion; real diffusion has sharp cores and soft veils at once.
- Wind chimes, bells on every cut, constant pads, whooshes, stock pentatonic riffs.
- Ending on a cut to black; let the image settle or dissolve into paper or grey.
