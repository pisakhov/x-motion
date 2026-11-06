# FIRST LIGHT

An original six-second material-to-mark study for X Motion.

## Thesis

For people evaluating an agent's motion-design craft, make **precision feel earned**: an instrument turns toward its inspection light, its shutter opens, and the light becomes the X in a deliberately drawn wordmark. The object does not decorate a title; its action produces the title.

Assumption: this is a silent, standalone craft proof, not a product-feature claim or an approved permanent brand identity. No reference artwork or third-party identity was traced.

## Delivery

- 960 × 540, 16:9, 30 fps, six seconds.
- `index.html` is the entire composition. Canvas2D, no imports, network requests, external fonts, media, or dependencies.
- `window.motion` declares the format; `await window.renderFrame(seconds)` paints the entire frame from that timestamp. Values outside the timeline clamp to its endpoints.
- `?render=1` disables autonomous playback. Ordinary preview plays once and holds; reduced-motion preference displays the final pose.
- Full-frame background: `#07090c`. The canvas has a descriptive accessible label and the document has a title.

## Shot beats

| Time | Frame / action | Purpose |
| --- | --- | --- |
| 0–0.8 s | Titanium instrument emerges from black, oblique and close. At **0.5**, its beveled ring, thickness, etched scale and closed leaves are the subject. | Establish a physical mechanism rather than an abstract loading spinner. |
| 0.8–2.25 s | Camera-equivalent orientation turns toward the face while a champagne inspection source travels across its bevel. At **1.8**, eight shutter leaves open around a dark center. | Changing reflections describe the material; opening describes intent. |
| 2.25–3.35 s | A restrained optical cross grows inside the aperture. At **3.0**, the almost frontal instrument frames the cross. | A causal bridge between mechanism and identity. |
| 3.0–4.15 s | The ring recedes and extinguishes; the optical cross travels left, thickening into the drawn X. | Transfer attention without a cut or unrelated logo overlay. |
| 3.62–4.75 s | Geometric MOTION strokes resolve beside the X. At **4.4**, the identity reads and the subordinate caption is landing. | A small left-to-right machining-like reveal, not bouncing letter choreography. |
| 4.75–6 s | Entirely still final composition. At **5.8**, X MOTION / FIRST LIGHT, with a quiet study footer. | Give recognition and reading time; no perpetual idle motion. |

## Form, typography, light

The object is a purpose-built projected mesh: an eight-point lathed titanium cross-section, 192 angular divisions, depth-sorted surfaces, eight shutter leaves, concentric machining paths, and sixty etched index marks. Analytic lighting emphasizes edges; it is a stylized Canvas2D material, not a physically based ray-traced simulation.

The hero letters are original geometric paths defined in this file, not a system-font wordmark. Chamfered O counters echo the aperture. Thin subordinate instrument labels use the browser's generic monospace font; those labels can vary slightly between operating systems, while the hero geometry does not.

Palette:
- Carbon negative space: `#07090c` to `#10151b`.
- Titanium: blue-neutral darks and restrained silver reflections.
- Inspection light: warm champagne, approximately `#f2d7ac`.
- Settled identity: warm chalk `#e6e4db`.
- Secondary notation: muted brass `#a99d87` and steel `#787f87`.

No particles, stock textures, cards, purple wash, lens-flare sprites, or environmental scenery. The glow is local to the aperture and disappears with its optical role.

## Safe areas / hierarchy

Opening annotations stay at least 55 px from the left/right edges and approximately 55 px from the top/bottom. The hero object stays centrally contained. Final identity occupies approximately x=229–719, y=224–294; the subordinate copy ends at y=402. The final rule extends to x=731. The reading hierarchy is X MOTION, then FIRST LIGHT, then optional study notation. The tiny edge labels and footer are atmospheric metadata, not required information, and should be judged at actual viewing size.

## Asset provenance

All geometry, letter paths, surface lighting, shutter construction and timing are authored directly for this example. There are no downloaded, model-generated, borrowed, or embedded raster/video assets. No font files are distributed. Procedural detail uses fixed trigonometric expressions, not random noise. No wall-clock state enters the frame renderer; requestAnimationFrame timestamps are used only by the opt-out preview driver.

## Sound intent

**This prototype renders silently.** A future sound pass would use a low, restrained mechanical turn at emergence; a dry shutter release around 1.8 s; and one short, soft metallic harmonic as light becomes the X at approximately 3.3 s. Let that tail decay before the final hold. No whoosh per letter, no implied existing soundtrack, no audio asset licensing claim.

## Evidence and human review

Local headless Chromium checks: exact declared dimensions/runtime/fps; no page errors; render mode schedules no animation frame; repeated 1.8 s render after out-of-order seeks is pixel-identical by PNG SHA-256; reduced-motion preview matches the 6 s final frame. Seven timestamp captures plus a repeat completed in about 1.34 seconds including screenshot overhead in this environment. No output files are required for those checks.

These checks are not aesthetic approval. The authoring helper has **not visually inspected the rendered stills or watched the exported video**; the parent renderer/reviewer must do that. Inspect 0.5, 1.8, 3.0, 4.4 and 5.8 s, and watch all six seconds at speed. Human judgment remains essential for titanium believability, shutter depth sorting, whether the light-to-X transition feels causal rather than a dissolve trick, readability and optical spacing of the custom letters, understated brightness, and whether the final hold feels composed rather than inert. Check the fine machining lines for aliasing at delivery size and after video compression.
