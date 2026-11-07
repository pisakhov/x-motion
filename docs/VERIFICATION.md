# Verification: themed gallery

Evidence for the themed gallery release (XM-0004 to XM-0012). It records what was checked, not a promise of taste.

## Reproduce

```sh
npm ci
npx playwright install chromium
npm run check
npm test
npm run test:browser
npm run catalog -- validate
npm run build:site
npm run test:gallery
docker build -t x-motion .
docker run -d --rm -p 127.0.0.1:8796:8080 x-motion
GALLERY_URL=http://127.0.0.1:8796 npm run test:http
GALLERY_URL=http://127.0.0.1:8796 npm run test:gallery
```

Render a film with `node scripts/render.mjs examples/orbit/passage.html --out renders/passage --video` (use a fresh output path).

## Observed locally

- Static checks: 4 skills, 9 compositions; no em dashes in skills, references or page templates.
- Unit tests: 29 passed, 4 browser tests skipped by design; `test:browser` ran those 4 and all passed.
- Catalog: 12 records validate (3 discarded, 9 in review).
- All nine films were rendered serially at 1920×1080, 30 fps, with every frame captured, a backward-seek frame check and a double audio render. Every film passed both determinism checks with zero clipped samples.

| ID | Film | Length | Integrated | True peak |
| --- | --- | --- | --- | --- |
| XM-0004 | Passage | 9 s | -18.0 LUFS | -1.7 dBFS |
| XM-0005 | Terminator Line | 10 s | -18.0 LUFS | -7.3 dBFS |
| XM-0006 | Eclipse | 10 s | -18.0 LUFS | -4.6 dBFS |
| XM-0007 | Dispersion | 9 s | -18.0 LUFS | -5.4 dBFS |
| XM-0008 | Caustics | 10 s | -18.0 LUFS | -4.5 dBFS |
| XM-0009 | Lens | 9 s | -18.0 LUFS | -3.7 dBFS |
| XM-0010 | Bloom | 10 s | -17.9 LUFS | -6.4 dBFS |
| XM-0011 | Stroke | 8 s | -17.8 LUFS | -6.5 dBFS |
| XM-0012 | Mist | 12 s | -18.2 LUFS | -3.2 dBFS |

- Gallery end-to-end (local server and the production nginx image): 3 theme chapters, 9 film pages (metadata, muted playback, no autoplay, prompt copy, ID copy, skill links, arrow keys), 4 skill pages (raw Markdown served as `text/markdown`, Copy Markdown equals the file byte for byte, download link), 404 page, relative redirects, no overflow or controls under 44 px at 360, 390, 768 and 1280 px, reduced motion keeps previews still.
- HTTP suite against the image: health, security and cache headers, catalog, video, poster and preview digests, byte ranges, page content types.

## Review notes

- Poster frames and selected stills of all nine films were inspected as images. During review the Terminator Line ground read olive; the ocean and land shading were cooled and the film re-rendered. A warm cast on sunlit land remains by design at the dawn line.
- The theme authors checked their work with storyboard stills only. Two Orbit films, Passage and Eclipse, render slowly (about 1.5 to 1.8 s per frame) on this machine.

## Not established

Nobody has watched the films end to end or listened to the scores for this record. Loudness numbers are measurements, not a listening review. Browser checks prove playback works, not that pacing or sound are good. No phone performance benchmark was run.

All nine films and three theme skills were authored by Claude Opus 5.5 sessions; the lead session (also Opus 5.5) made the Terminator colour fix.
