---
name: x-motion
description: Art-direct and build original motion graphics, animated explainers, title sequences, product films, and kinetic typography. Use for motion briefs, storyboards, animatics, deterministic HTML animation, synchronized audio, and rendered-video critique. Start with the audience and a visual thesis, not a template.
---

# X Motion

Make motion that communicates something specific. Taste is contextual: a quiet technical demonstration and an exuberant music ident need different decisions. A capable renderer is not a guarantee of good design. The work earns its quality through art direction, execution, observation, and revision.

This is an original, portable motion-design method inspired by the design-agent discussion in [LangChain's article](https://www.langchain.com/blog/design-agent). It does not depend on LangChain code or services and implies no affiliation.

## Working contract

- Follow the host project's instructions and the user's actual scope. This skill grants no permission to publish, spend, call models, obtain credentials, or use unlicensed assets.
- Use one visual thesis and one dominant focal point **at a given moment**. Complexity may support the thesis; it must not compete with it accidentally.
- Design the type, spacing, image treatment, motion, and sound as one system. Do not decorate a weak idea into apparent sophistication.
- Choose tools for the job and available environment. No particular model, framework, or rendering engine is required.
- Separate technical evidence from aesthetic judgment. Never invent a taste score, audience reaction, or approval. Never claim to have watched a video when only its stills were inspected.
- Keep assets local and their provenance explicit. Pin dependencies. Keep generated renders out of version control unless the project deliberately requires them.

## Choose the smallest useful process

**Small edit:** a copy correction, timing adjustment, asset swap, or isolated easing fix may bypass a new brief, storyboard, and animatic. Preserve the approved direction; inspect the affected beat and its neighbors, rerender, and run relevant checks. Escalate to the full process if the change alters the message, hierarchy, or narrative.

**New composition or substantial redesign:** follow the stages below. Scale the artifacts to the assignment; a six-second title does not need a production bible. If crucial intent is missing, ask a focused question. When questions are unavailable, label a conservative assumption and avoid irreversible work.

## 1. Brief → visual thesis

Establish audience, intended takeaway, viewing context, duration, aspect ratio, deliverables, required copy/assets, brand constraints, accessibility needs, and whether sound can carry meaning. Mark hard requirements separately from preferences.

Write a thesis in this form:

> For [audience], make [idea] feel [specific quality] through [visual mechanism], so they understand or do [outcome].

Name the organizing metaphor, dominant subject, typographic role, and motion logic. A list such as “premium, cinematic, clean” is not a direction. Explain which choices make those words tangible. Use references to identify principles, not to reproduce another work's identity.

Read [Art direction](references/art-direction.md) for brief resolution, reference analysis, and a coherent visual language.

## 2. Storyboard → readable argument

Plan beats before polishing frames. For each beat, record:

| Time range | What the viewer learns | Focal point / key frame | Transition and reason | Audio cue |
| --- | --- | --- | --- | --- |
| Start–end | One message | Subject and hierarchy | What changes, and why | Event or deliberate silence |

Draw or render representative frames with real copy and realistic asset proportions. Give reading and recognition enough time; do not distribute every beat evenly by habit. Confirm the opening promise, the causal links between beats, and the final takeaway. Validate critical copy or direction with the human when needed before expensive production.

Read [Typography](references/typography.md) before locking composition or text timing.

## 3. Animatic → test time cheaply

Build rough timed frames, blocks, or low-detail motion. Use scratch sound only when lawful and clearly labeled. Test the full runtime at its intended speed, not just by scrubbing.

Check whether attention arrives where the information does, whether text can be read, and whether the ending has room to land. Fix structure here. Surface uncertainty about the direction instead of polishing it away.

Read [Animation and camera](references/animation-camera.md) for temporal design and deterministic scene construction; read [Audio](references/audio.md) when sound is part of the piece.

## 4. Production → intentional execution

Refine approved beats with final typography, assets, lighting or graphic treatment, motion curves, transitions, and sound. Preserve the thesis. Each added effect must have a job: reveal, connect, emphasize, orient, or resolve. If it does none of these, remove it or justify its expressive role.

### Optional HTML renderer contract

When using the X Motion HTML renderer, each composition exposes:

```js
window.motion = { width: 1920, height: 1080, duration: 8, fps: 30 };
window.renderFrame = function (tSeconds) {
  // Set every animated property from this timestamp and fixed scene data.
  // Repeated calls, including calls out of order, produce the same frame.
};
```

These numbers are illustrative, not design defaults. Width and height are pixels; duration and `tSeconds` are seconds; fps is the frame rate. Match them to the brief.

- Calculate state directly from the supplied timestamp. No wall-clock time, autonomous CSS animations, accumulating simulation steps, network assets, or unseeded randomness.
- Load and decode local assets and fonts before capture. Do not introduce asynchronous frame mutations after `renderFrame` returns; verify the host renderer's readiness mechanism.
- Define behavior at beat boundaries and beyond the active interval. Test repeated timestamps and backward seeks.
- The frame function defines visuals, not audio playback. Use an explicit audio timeline and the host pipeline's supported muxing path; do not assume HTML media playback will be captured.

Resolve this skill directory's real location first, following any installation symlink into the full X Motion clone. The repository root is `../..` relative to that resolved `skills/x-motion` directory—not relative to the user's current working directory. Change to that repository root before running these commands; composition paths below are relative to it.

Export storyboard PNGs and `manifest.json` (no video by default):

```sh
node scripts/render.mjs path/to/scene.html --out renders/name-storyboard
```

Export storyboard PNGs, full frames, silent `film.mp4`, and `manifest.json`:

```sh
node scripts/render.mjs path/to/scene.html --out renders/name-video --video
```

Use a fresh output directory for each revision. Inspect `manifest.json` and the actual outputs before reporting success. Video encoding requires ffmpeg; audio is not captured. Optional sound synthesis and separate audio muxing are documented in the repository's example guide, not implied by `--video`. In another host, preserve deterministic timestamp semantics and adapt the export command.

## 5. Critique → revise → deliver

Inspect rendered artifacts, not only source. View the storyboard for composition and play the video for rhythm; listen to the exported audio when present. If playback or listening is unavailable, state exactly what remains unreviewed.

Use [Critique and delivery](references/critique-delivery.md) to separate measurable failures from subjective concerns. Address the highest-impact issue first. Limit the critique/revision loop to **three iterations per direction**. If the direction remains unresolved, stop, explain the competing concerns, and ask the human to choose or clarify before continuing. A technical pass is not aesthetic approval.

Deliver the artifact location, source location, export specifications, verification evidence, known limitations, and unresolved approval questions. Report what you actually observed. Do not publish externally without authorization.

## Reference map

Load only the references needed for the current stage:

- [Art direction](references/art-direction.md): intent, taste, references, visual thesis.
- [Animation and camera](references/animation-camera.md): timing, staging, transitions, deterministic rendering.
- [Typography](references/typography.md): hierarchy, readable kinetic type, font handling.
- [Audio](references/audio.md): cue maps, synchronization, silence, export checks.
- [Critique and delivery](references/critique-delivery.md): evidence, bounded revision, handoff.
