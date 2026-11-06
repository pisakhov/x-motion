# Foundation verification

This is evidence for the initial implementation, not a permanent promise of quality.

## Reproduce

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run check
npm test
npm run test:browser
npm audit --audit-level=high
node scripts/render.mjs examples/first-light/index.html --out renders/review --video
```

Use a new output path for subsequent runs. `npm test` runs lightweight checks and intentionally skips two Chromium integration tests; `npm run test:browser` runs those explicitly.

## Observed locally

- Static skill/reference/example checks passed.
- 11 lightweight tests passed; both explicit browser integration tests passed.
- No high dependency vulnerabilities reported by npm audit.
- The real sample exported 180 frames at 960×540, 30 fps, six seconds, plus five storyboard frames and H.264 MP4.
- A backward seek to timestamp zero reproduced the same PNG hash. This checks one specific temporal invariant; it is not a proof of all-frame or cross-platform determinism.
- Original sound synthesis passed repeatability, sample-peak and non-overwrite checks. Muxed export was probed as six-second H.264 + mono 48 kHz AAC.
- Actual aperture and final-title frames were inspected. Embedded playback and compare cards passed browser checks at 340×300, 760×460 and 1280×800.
- Independent review found a real preview/capture race: renderer navigation initially omitted `?render=1`. It is fixed and protected by source-contract and real-browser tests.

## Not established

No human aesthetic approval, audience response, phone performance benchmark or listening review has been established. Browser playback checks do not mean a human watched the film or approved its pacing. The sample is an initial study, not a claim of world-class finish.

Opus 5.5 was attempted but hit its session limit before authoring the scene; the sample was authored by the Astra fallback. Do not attribute it to Opus. The preferred-model recommendation is a future authoring choice, not an evaluation result.
