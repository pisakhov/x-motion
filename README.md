# X Motion

**Short films made by coding agents, published with the prompt and the skill behind each one.**

Give a capable agent a brief, a point of view and a real render and review loop. Get editable scene code, a storyboard, a finished film with an original synthesized score, and an honest account of what was verified.

Inspired by LangChain's [How We Built Our Design Agent](https://www.langchain.com/blog/design-agent). Original implementation; not a fork, affiliated service, or copy of their motion engine. See [provenance](docs/PROVENANCE.md).

## The gallery

**[Open the gallery](https://x-motion.187.77.218.3.sslip.io)**. It is a static, multi-page site organized by theme:

| Theme | Skill | Idea |
| --- | --- | --- |
| Orbit | [`x-motion-orbit`](skills/x-motion-orbit/SKILL.md) | Titanium, starlight and the curve of the Earth. |
| Prism | [`x-motion-prism`](skills/x-motion-prism/SKILL.md) | Light, glass and colour at rest. |
| Sumi | [`x-motion-sumi`](skills/x-motion-sumi/SKILL.md) | Ink, paper and breath. |

Each theme also has a one-minute narrated film that cuts its three short films together: **One Orbit**, **Bending Light** and **One Breath**. They combine narration, an original score, sound effects placed on picture events, a mix that ducks under every line, and transitions designed for each theme. Film pages offer English captions and a transcript.

Every film page shows the exact prompt that started it, the skills that shaped it, the model that wrote it and a link to its source. Every skill opens as a readable page with **Copy Markdown** and **Download**, so you can paste it into any agent. The raw files are served at `/skills/<name>/SKILL.md`.

Each film has a permanent ID such as `XM-0004`. Tell X in chat, for example: "XM-0004: keep the flare, slow the planet rise." Revisions get new IDs linked to their parents. Discarded films leave the deployed gallery but remain in source history. See [the feedback workflow](docs/FEEDBACK.md) and [deployment](docs/DEPLOYMENT.md).

```sh
npm run catalog -- list
npm run catalog -- validate
npm run build:site
npm run test:gallery
```

Published MP4, poster and preview snapshots in `gallery-media/` are tracked and hash-checked so deployment reproduces exactly the reviewed films. Working frames and intermediate renders stay ignored. Private feedback is never committed to this public repository.

## The skills

Start with [`skills/x-motion/SKILL.md`](skills/x-motion/SKILL.md), the core method. It routes small refinements differently from new films, then loads only the craft references the job needs. Each theme skill extends it with a palette, light and material rules, motion vocabulary, a sound palette with mixing targets, technique recipes and a list of things to avoid.

- **Direction before decoration.** A specific visual thesis, not a collection of fashionable effects.
- **Storyboard, animatic, production.** Inspect real renders before spending on polish.
- **Motion has intent.** Timing, camera, material and sound support the message.
- **Quality is reviewed, not declared.** Technical checks cannot certify taste.

Opus 5.5 is the recommended creative author for this project, not a hard-coded dependency. The skills cannot switch models or grant permissions, and no model API calls or keys are required by this repository.

## Install into your agent

Clone the **whole repository** so the renderer and references stay available:

```sh
git clone https://github.com/pisakhov/x-motion.git
cd x-motion
npm ci
npx playwright install chromium
```

Install Node.js 22+ and FFmpeg separately. On a minimal Linux machine, Chromium may also need OS libraries (`npx playwright install-deps chromium`; inspect before running with elevated privileges).

For Pi, link the skills into its discovery directory (the command refuses to replace an existing path):

```sh
mkdir -p ~/.pi/agent/skills
for skill in skills/*/; do ln -s "$PWD/$skill" ~/.pi/agent/skills/; done
```

Run `/reload`, then `/skill:x-motion-orbit Create a ten-second film of…`. For Claude Code or another Agent Skills host, link the same directories into its skill location, or ask the agent to read the Markdown directly.

## Render a film

```sh
npm run check
npm test
node scripts/render.mjs examples/orbit/passage.html --out renders/passage-board --audio
node scripts/render.mjs examples/orbit/passage.html --out renders/passage --video
```

The long films load their source films from sibling folders, so serve the whole `examples` directory with `--root`:

```sh
node scripts/render.mjs examples/orbit/one-orbit.html --root examples --out renders/one-orbit --video
```

A storyboard writes five PNG stills and `manifest.json`; `--times 0.5,2,4.25` picks the stills and `--audio` adds `sound.wav` with loudness figures. `--video` also writes every frame, `poster.webp` and `film.mp4` with the score muxed as AAC. Use a fresh `--out` path for each revision; outputs are never silently overwritten.

To publish a render, write a spec with the source, theme, slug, title, description, prompt, skills and model, then:

```sh
npm run catalog -- add --render renders/passage --spec spec.json
```

This copies the verified film and poster under the next permanent ID, makes a muted 960 px preview loop, and records the film in **Review**.

### Long films and narration

`examples/reel/reel.js` builds a long film out of existing compositions. It opens each source film in a hidden frame, asks it for a frame at a remapped time, and composites the shots with a WebGL2 transition shader. Each shot's time map is a monotone curve, so a shot can ease into slow motion without jumping or reversing. The same map, inverted, places each sound effect on its visual event. Title cards are HTML text. The score uses the Orbit kit's audio tools, mixed with the narration track. Music and effects duck under each spoken line, and the finished mix is normalised to -18 LUFS with a -1.7 dBTP ceiling.

Narration is generated from a script with Kokoro (see [provenance](docs/PROVENANCE.md)):

```sh
python scripts/voice.py examples/orbit/voice/one-orbit.json            # writes .flac, .cues.json and .vtt
python scripts/voice.py examples/orbit/voice/one-orbit.json --check    # transcribe and report word error rate
```

To publish captions with a film, add `"captions": "examples/orbit/voice/one-orbit.vtt"` to the catalog spec.

### Composition contract

A trusted local HTML file exposes:

```js
window.motion = { width: 1920, height: 1080, duration: 9, fps: 30, poster: 7.5 };
window.renderFrame = (seconds) => { /* redraw the entire frame from this time alone */ };
window.renderAudio = async ({ sampleRate }) => { /* optional: return an AudioBuffer from an OfflineAudioContext */ };
```

The renderer opens the file with `?render=1`; disable preview playback in that mode. Frames must depend only on time and fixed data: no accumulated simulation, wall clock or unseeded randomness. The renderer seeks backward to prove frame determinism, renders the score twice to prove audio determinism, and records integrated loudness, true peak and clipped samples. Playwright captures frames, FFmpeg encodes H.264; no paid render service or external asset fetches.

## Scope

This release provides a core skill with focused references, three theme skills, nine original films, a static themed gallery, deterministic frame and audio capture, MP4 export and tests. It does **not** reproduce LangChain's Slack app, sandbox orchestration, reference-film library or production approval service. Storyboard approval is a human workflow step, not a software lock.

**Trust boundary:** render only trusted compositions. Blocking network requests is not an OS sandbox; browser code still runs locally. Never render unknown third-party HTML on a machine containing secrets.

## Verification and contribution

Run `npm run check && npm test`, render the affected scenes, inspect key frames, play the film and listen to it, and record specific findings. Changes go through branches and review. Never equate "tests pass" with "the film is beautiful." MIT licensed; the bundled Geist fonts are under the SIL Open Font License (`site/fonts/OFL.txt`).
