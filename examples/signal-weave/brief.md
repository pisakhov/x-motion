# SIGNAL WEAVE

## Delivery
- Exactly **7 seconds**, **30 fps**, **960 × 540**, 16:9; 210 export frames.
- Standalone Canvas HTML: `index.html`; no libraries, network requests, images, or downloaded fonts.
- API: `window.motion = {width:960,height:540,duration:7,fps:30}` and synchronous `window.renderFrame(t)`.
- Silent intentionally. The traveling shuttle and formation of the weave carry the causal argument without sound.

## Thesis
For viewers interested in systems and design, make independent signals feel exact and mutually useful through an interlaced line textile: connection produces a coherent field.

## Art direction
Cobalt ground; fine warm-ivory warp and weft; restrained apricot signal shuttles. One woven object carries the film. Line-weight cadence, alternating junctions and registration corners give the textile a technical rather than atmospheric character. An initial close view reveals individual lines; the camera backs out to expose the field before moving it right to make space for the title. Typography is deliberately unembellished: Arial/system sans for the title, system monospace for annotations.

## Seven-second score
| Time | Focal event | Purpose |
|---|---|---|
| 0.00–1.20 | “ONE THREAD.”; sequential horizontal signal arrival in a close view | Establish the material |
| 1.20–2.50 | Crosswise paths enter; the lines straighten and begin interlacing | Connection causes structure |
| 2.50–4.15 | Full textile resolves; short traveling pulses cross the field | Reveal coherence and allow recognition |
| 4.15–5.30 | Field moves right as “SIGNAL / WEAVE” locks up at left | Make the system name the final focal point |
| 5.30–5.80 | Last signal accent leaves the field | Quiet outro, not another event |
| 5.80–7.00 | Clean title and woven-field hold | Protect reading time |

## Provenance and reproducibility
Original composition, copy, geometry, curve functions and timing authored for this example. No external visual or audio assets. Fonts are host-provided Arial/sans-serif and monospace; glyph rasterization can differ across operating systems. No paid calls or third-party assets.

Every frame clears and resets the drawing state, derives geometry exclusively from a finite clamped timestamp, and returns synchronously. Non-finite inputs resolve to zero; negative and beyond-duration inputs clamp to endpoints. Preview RAF is disabled by `?render=1`; reduced-motion preview shows the settled final frame. No randomness, asynchronous asset loading, or accumulating simulation.

## Verification status
Source/API inspection only in this helper session. No browser, renderer, video, or aesthetic approval was run or claimed. Parent should render sequentially, inspect early weave junctions and the camera-to-lockup transition, compare repeated/backward timestamp pixel hashes, and review the complete silent film at playback speed. Final readable frame is already settled before frame 209.
