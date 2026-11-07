# Provenance and boundaries

## Inspiration

- LangChain, A. Irgashev and S. Talegaonkar, [How We Built Our Design Agent](https://www.langchain.com/blog/design-agent), October 27, 2026.
- [langchain-ai/design-agent](https://github.com/langchain-ai/design-agent), including its README and NOTICE.

Borrowed **ideas**, expressed here in original instructions and code: taste needs explicit context; load task-specific skills progressively; inspect deterministic renders; separate technical gates from aesthetic judgment; stage film work through storyboard, animatic and production; preserve designer feedback with its reasoning; remove stale rules when model capabilities improve.

No upstream source, proprietary brand assets, reference-film collection, fonts, skills or animation engine have been vendored. We do not claim LangChain compatibility or affiliation. The upstream repository uses Apache-2.0 with separately licensed components; copying anything later requires a fresh license review and preservation of applicable notices.

## Local work

X Motion's instructions, tooling, theme skills and films are original contributions under the repository MIT license. Every film is procedural code: shaders, canvas drawing and Web Audio synthesis with seeded noise and synthetic reverb. There are no stock images, footage, samples, recorded sounds, cloned voices or third-party textures. The three narrated long films are the one exception to "all synthesis in the browser": their narration is speech generated offline, described below. The Orbit theme takes its emotional starting point from the owner's own X-Agent console login sequence, described in words and rebuilt from scratch; no code or assets were copied from it.

The retired studies XM-0001 to XM-0003 (First Light, Signal Weave, Weight of Type) remain in Git history and the catalog as discarded records.

## Narration

The narration in One Orbit, Bending Light and One Breath is synthetic speech generated locally by `scripts/voice.py`. No voice was recorded, cloned or imitated. The scripts are original and live beside each film in `examples/<theme>/voice/<slug>.json`.

- **Model:** [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) v1.0 by hexgrad, Apache-2.0, run through [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) 0.6.1 (MIT) and onnxruntime 1.31.1 (MIT). Preset voices: `af_heart` (Orbit), `bf_emma` (Prism) and `am_michael` (Sumi).
- **Pinned files:** the model and voice files are verified by SHA-256 before every run. Each `<slug>.cues.json` records those digests, the package versions, the voice, the timing of every line and the digest of the generated `<slug>.flac`.
- **Processing:** each line is trimmed, upsampled from 24 to 48 kHz, high-passed at 75 Hz with a 1.5 dB presence lift at 3.2 kHz, then levelled and limited to -2 dBFS. Everything is plain NumPy; nothing leaves the machine.
- **Checking:** `voice.py --check` transcribes a track with faster-whisper `base.en` (MIT; OpenAI Whisper weights, MIT) and reports word and letter error rates against the script. This is an intelligibility check, not a listening review.
- **Captions:** `<slug>.vtt` is generated from the same timings and published beside each film. Its transcript appears on the film page.

The Python environment lives outside the repository, at `~/.local/share/x-motion-tts`. Rendering a film needs only the committed `.flac` and `.cues.json` files, not Python.

## Fonts

The gallery self-hosts Geist and Geist Mono variable fonts from the `geist` npm package (version 1.9.2) by Vercel, under the SIL Open Font License 1.1. The license ships beside them as `site/fonts/OFL.txt`. The nine short films use no fonts. The long films set their titles in the same Geist file, copied with its license to `examples/reel/fonts/`.

## Runtime dependencies

Playwright is pinned in `package-lock.json` and carries Apache-2.0 licensing. Chromium is downloaded separately under its own notices. FFmpeg is installed separately; licensing depends on its build and codec configuration. They are not relicensed by this repository. The narration tools listed above are not runtime dependencies of the site or the renderer. Distribution of rendered client assets also requires rights to every font, logo, image, music and voice used.
