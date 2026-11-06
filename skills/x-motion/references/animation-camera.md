# Animation and camera: design attention over time

## Stage before easing

Every beat has an arrival, a legible state, and a departure. These need not be equal in length. Distinguish time spent moving from time available to understand. A caption that is technically on screen while blurred or displaced is not fully readable.

For each moving element, name its job:

- **Reveal:** introduce information in a useful order.
- **Connect:** show a relationship or preserve identity across scenes.
- **Emphasize:** direct attention to a meaningful change.
- **Orient:** make scale, position, or causality understandable.
- **Resolve:** communicate completion, stability, or release.

Expressive motion may also establish character or atmosphere, but it still needs a relationship to the thesis. Continuous activity is not the same as momentum.

## Rhythm and hierarchy

Use contrast between motion and stillness, short and long beats, wide and close views. Avoid moving every layer with equal intensity. When the focal point changes, choreograph a handoff: the old focus settles or recedes as the new one becomes salient.

Let content determine pacing. Complex diagrams need time to resolve; a familiar shape may register quickly. Test with full-speed playback and actual copy. Do not claim a universal reading-time formula proves comprehension.

## Curves and physical character

Choose curves for perceived intent, not because a library offers them:

- A controlled ease can communicate precision and deliberate arrival.
- Linear travel can make steady progress or mechanical continuity legible.
- Overshoot can communicate elasticity or play; it can also undermine seriousness.
- A hard cut can communicate contrast more clearly than a decorative morph.

Match velocity at connected segments where continuity matters. Make abrupt changes intentional. Keep overshoot, blur, and scale within the frame's safe area; an unclipped resting state does not prove the transition is unclipped.

For a simple timestamp-based segment:

```js
const clamp01 = x => Math.max(0, Math.min(1, x));
const progress = (t, start, end) => clamp01((t - start) / (end - start));
const smooth = u => u * u * (3 - 2 * u);
const mix = (a, b, u) => a + (b - a) * u;
// Require end > start. This curve is an example, not a universal default.
const x = mix(-120, 0, smooth(progress(tSeconds, 0.4, 1.1)));
```

Use closed-form or precomputed, seeded motion for complex systems. Do not integrate physics by adding a delta on each render call: captures may seek backward or skip frames.

## Camera as a sentence, not wallpaper

Move the camera to reveal a relationship, follow an action, change the viewer's understanding of scale, or establish a point of view. A camera move that says nothing may simply make the composition harder to read.

- Establish spatial relationships before close framing removes context.
- Preserve a reference point during zooms or pans when orientation matters.
- Separate subject motion from camera motion unless their combination is intentional.
- Check perspective and parallax at extremes, not only at the middle frame.
- Protect readable text from arbitrary perspective distortion and excessive motion.

A locked camera can be the strongest choice. Simulated depth is optional; do not add a 3D stack to a problem that benefits from graphic clarity.

## Transition logic

Use shared shape, position, direction, color role, or semantic identity to connect beats. Do not morph unrelated objects merely because the interpolation is possible. When identity changes, a cut or explicit reveal may be more honest.

Check the transition itself as a designed frame sequence. Inspect near the start, overlap, midpoint, and end; look for accidental tangencies, competing focal points, z-order errors, clipping, and unreadable combinations.

## Deterministic frame discipline

`renderFrame(tSeconds)` must completely determine visible state from fixed inputs. Set properties for inactive and completed beats as well as active ones so earlier state cannot leak into later calls.

Avoid `Date.now()`, autonomous timers, uncontrolled media playback, CSS keyframes running on their own clock, and unseeded `Math.random()`. Precompute random-looking variation with a fixed seed. Load local fonts and images before capture and keep canvas sizing consistent with declared dimensions.

Verify:

1. Rendering the same timestamp twice produces the same frame in the same environment.
2. Rendering a late timestamp, then an early timestamp, matches the early frame rendered from a clean state.
3. Beat boundaries have intentional states, with no one-frame flashes or missing elements.
4. Frames near zero and the final captured frame are valid. Do not rely on an exact `t = duration` frame being included by an encoder.
5. Exported duration and frame rate match the intended settings within the pipeline's documented frame-rounding behavior.

Determinism within a pinned environment does not imply identical pixels across operating systems, font renderers, or browser versions. Record the relevant environment when exact reproducibility matters.

## Motion accessibility

Avoid unnecessary flashing and aggressive full-frame oscillation. For interactive delivery, respect the host's reduced-motion behavior and provide a meaningful static or reduced alternative. A pre-rendered MP4 cannot react to that preference; offer an alternative when required. Automated checks can flag risks, not certify every viewer's comfort.
