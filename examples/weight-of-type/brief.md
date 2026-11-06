# WEIGHT OF TYPE

## Delivery
- Exactly **7 seconds**, **30 fps**, **960 × 540**, 16:9; 210 export frames.
- Standalone Canvas HTML: `index.html`; no libraries or remote assets.
- API: `window.motion = {width:960,height:540,duration:7,fps:30}` and synchronous `window.renderFrame(t)`.
- Intentionally silent. Impact is expressed through the shared baseline, compression and damped spacing, not an implied missing soundtrack.

## Thesis
For design-literate viewers, make typography feel materially heavy through letters that settle, compress into editorial bands and reopen into a stable title. Meaning resides in both the words and the force of their arrangement.

## Art direction
Warm paper and near-black ink, with a single small oxide-red weight marker. Oversized Arial/system sans in a heavy weight becomes the subject rather than an overlay. Widely spaced letters contract into a dense word; the shared baseline is the physical anchor. Cropped repeating strips operate as print-like masks, not decorative background. System monospace labels stay subordinate. The final two-line title is spacious, readable and motionless.

## Seven-second score
| Time | Focal event | Purpose |
|---|---|---|
| 0.00–1.60 | Partially visible oversized letters drop into “WEIGHT”; tracking damps toward a dense setting | Establish typographic mass and the baseline |
| 1.60–2.35 | The word compresses vertically into a printed strip | Pressure creates the next composition |
| 2.35–3.72 | Five masked editorial strips establish rhythm around one reversed central band | Show type as material, not unrelated captions |
| 3.72–4.85 | The strips clear and the central mass expands into the final title | Restore hierarchy |
| 4.85–5.35 | “OF TYPE” and the explanatory baseline finish settling | Resolve the reading order |
| 5.35–7.00 | “WEIGHT / OF TYPE” holds with “NOT JUST WHAT IT SAYS. / HOW IT LANDS.” | Clear, quiet outro and reading time |

## Provenance and reproducibility
Original copy, typography treatment, masks, geometry and closed-form motion authored for this example. No images, imported artwork, font downloads or audio. Host-provided Arial/sans-serif and monospace are intentional safe system-font stacks; exact glyph appearance depends on the rendering environment. No paid calls.

The glyph spacing and damped motion are calculated directly from the requested timestamp. Canvas drawing state is reset each frame. Inputs are clamped to 0–7 seconds, with non-finite input mapped to zero. No randomness, asset loading, simulation accumulation or asynchronous mutations. `?render=1` disables RAF. Reduced-motion preview displays the final lockup.

## Verification status
Source/API inspection only; no browser, build or render was launched in this helper session. Parent should render sequentially, inspect the compression-to-strip transition and final mask boundary, compare repeated/backward frame hashes, and watch the entire film at intended playback speed. No aesthetic approval is implied. The final card holds well before the last captured frame.
