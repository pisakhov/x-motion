# X Motion

**A motion-design skill, not a template factory.**

Give a capable coding agent a brief, a point of view and a real render/review loop. Get editable scene code, a storyboard, a timed film and an honest account of what was verified.

Inspired by LangChain’s [How We Built Our Design Agent](https://www.langchain.com/blog/design-agent). Original implementation; not a fork, affiliated service, or copy of their motion engine. See [provenance](docs/PROVENANCE.md).

## Watch and shape the collection

**[Open the motion gallery](https://x-motion.187.77.218.3.sslip.io)** — a lightweight Dokploy-hosted showcase, not a new agent application.

Every published film has a permanent ID. Tell X in chat, for example: **“XM-0002 — keep the cobalt, slow the final reveal.”** The gallery's copy buttons prepare an ID or feedback template; they do not save feedback themselves.

- `XM-0001` — **First Light**, 6s, original sound.
- `XM-0002` — **Signal Weave**, 7s, silent.
- `XM-0003` — **Weight of Type**, 7s, silent.

All begin in **Review**, not approved. Improvements get new IDs linked to their parents. Discarded studies leave the deployed collection but remain in source history. See [the feedback workflow](docs/FEEDBACK.md) and [deployment](docs/DEPLOYMENT.md).

```sh
npm run catalog -- list
npm run catalog -- validate
npm run build:site
npm run test:gallery
```

Small published MP4/poster snapshots in `gallery-media/` are deliberately tracked and hash-checked so deployment reproduces the exact reviewed video. Working frames and intermediate renders remain ignored. Private feedback must never be committed to this public repository.

## The skill

Start with [`skills/x-motion/SKILL.md`](skills/x-motion/SKILL.md). It routes small refinements differently from new films, then loads only the craft references the job needs.

- **Direction before decoration.** A specific visual thesis, not a collection of fashionable effects.
- **Storyboard → animatic → production.** Inspect actual renders before spending on polish.
- **Motion has intent.** Timing, camera, typography, material and sound support the message.
- **Quality is reviewed, not declared.** Technical checks cannot certify taste. No invented aesthetic scores.
- **Models get creative freedom.** Principles and critique, not 115 compulsory layout presets.

Opus 5.5 is the recommended creative author for this project, not a hard-coded dependency. Select it in your agent host; the skill cannot switch models or grant permissions. Other capable coding models can use the same workflow. No model API calls or keys are required by this repository.

## Install into your agent

Clone the **whole repository**, so supporting tools and references remain available:

```sh
git clone https://github.com/pisakhov/x-motion.git
cd x-motion
npm ci
npx playwright install chromium
```

Install Node.js 22+ and FFmpeg separately. On a minimal Linux machine, Chromium may also require OS libraries (`npx playwright install-deps chromium`; inspect before running with elevated privileges).

For Pi, link the skill into its discovery directory (the command refuses to replace an existing path):

```sh
mkdir -p ~/.pi/agent/skills
ln -s "$PWD/skills/x-motion" ~/.pi/agent/skills/x-motion
```

Run `/reload`, then `/skill:x-motion Create a six-second launch ident for…`.

For Claude Code or another Agent Skills host, link the same directory into that host’s supported skill location, or ask the agent to read `skills/x-motion/SKILL.md` directly. Keep the repository checkout available. The Markdown instructions are portable; the bundled renderer is optional.

## Run the original example

**First Light** is a six-second study, not a universal house style. Its [brief](examples/first-light/brief.md) records the intent, shot timing and provenance. Do not recycle its look for unrelated briefs.

```sh
npm run check
npm test
npm run storyboard
npm run render
```

Outputs go to ignored `renders/` directories. Use a fresh `--out` path for each revision; existing outputs are not silently overwritten. The renderer exports a **silent** MP4, storyboard PNGs and a machine-readable manifest. Original optional sound design is documented in [the example guide](docs/FIRST_LIGHT.md).

### Composition contract

A trusted local HTML file exposes:

```js
window.motion = { width: 960, height: 540, duration: 6, fps: 30 };
window.renderFrame = async (seconds) => { /* redraw the entire frame */ };
```

The renderer visits the file with `?render=1`. Disable preview playback in that mode. Frames must depend only on time and fixed assets: no accumulated simulation, wall clock or unseeded randomness. Bundle fonts/assets locally and record licenses. Playwright captures sequential frames and FFmpeg encodes H.264; no paid render service or external asset fetches.

## What this first release is—and is not

The craft workflow is broader than the small bundled renderer. This release provides one portable skill, focused references, three original studies, a public feedback-oriented gallery, frame capture, MP4 export and tests. It does **not** reproduce LangChain’s Slack app, sandbox orchestration, reference-film library, temporal motion-blur engine or production approval service. Storyboard approval is a human workflow requirement, not a falsely advertised software lock.

Use another engine when the brief needs it: for example, a reviewed HyperFrames setup for editorial footage, or Three.js for genuine 3D. Read that engine’s current documentation and licenses first. Do not call Canvas shading “physically based 3D.”

**Trust boundary:** render only trusted compositions. Blocking network requests is not an OS sandbox; browser code still runs locally. Never render unknown third-party HTML on a machine containing secrets. Review assets, scripts and dependencies before use.

## Verification and contribution

Run `npm run check && npm test`, render the affected scenes, inspect key frames and playback, and record specific findings. Respect reduced-motion preferences in interactive previews. Film exports are inherently motion content; provide a still alternative and never autoplay sound in a webpage.

Changes go through branches and review. Never equate “tests pass” with “the film is beautiful.” MIT licensed; dependencies and external assets retain their own licenses.
