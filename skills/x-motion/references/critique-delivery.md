# Critique and delivery: evidence before confidence

## Use two independent lenses

**Technical verification** checks observable requirements: dimensions, duration, frame rate, codec, asset readiness, exact copy, missing frames, deterministic seeks, clipping, and audio presence or synchronization. Use tools where they can provide actual evidence.

**Design critique** interprets hierarchy, rhythm, meaning, tone, originality, and emotional fit. Support a judgment with a specific observation and the brief. An automated check cannot prove that a composition is beautiful, that viewers understand it, or that a human approves it.

Do not create numerical aesthetics scores or present model confidence as audience research. “The headline and diagram move simultaneously, splitting attention during the key claim” is actionable. “Quality: 9/10” is not evidence.

## Review the rendered work

1. **Storyboard:** inspect opening, major beats, densest frame, transition overlap, and ending. Check hierarchy and continuity using real rendered frames.
2. **Playback:** watch at intended speed. Inspect cadence, reading time, handoffs, camera comfort, and whether the final idea lands.
3. **Audio:** listen to the exported file if sound is included. Check sync, intelligibility, and tails.
4. **Target context:** preview at likely viewing size and consider the actual platform's crops, controls, and sound behavior.
5. **Source and metadata:** confirm technical requirements and reproducibility independently.

A contact sheet is not playback. Opening the file is not proof it was watched. Source inspection is not proof of the export. State the evidence level explicitly when tools or time prevent a review step.

## Bounded revision

For each iteration, record:

- **Observation:** what happens, with a timestamp or frame reference.
- **Consequence:** why it conflicts with the brief or readability.
- **Hypothesis:** the smallest change likely to improve it.
- **Verification:** which render or check will show whether it helped.

Prioritize correctness and communication before micro-polish. Change one coherent issue at a time so the result can be evaluated. Preserve useful before/after evidence when the host supports it.

Run no more than **three critique/revision iterations per direction**. This is a limit, not a quota. Stop sooner when the deliverable satisfies requirements and no justified revision remains. At the limit, if direction is unresolved, summarize the trade-off and ask the human for a decision before further creative iteration. Do not silently reset the count by renaming the same direction. In unattended work, stop with the best available local artifact and the precise decision needed.

Do not ship known technical failures as “creative choices.” If a technical blocker remains, mark delivery incomplete and describe it separately from aesthetic uncertainty.

## Practical verification checklist

Select checks relevant to the job; label omitted or unavailable checks.

| Check | Evidence to capture |
| --- | --- |
| Export specification | Actual dimensions, duration, frame rate, format / codec |
| Frame validity | Start, final captured frame, boundaries, transitions, no unintended blank frames |
| Determinism | Same timestamp repeated; early frame after a late seek compared with clean rendering |
| Assets | Local files resolved, fonts loaded, no unintended fallback or network dependency |
| Content | Required copy and factual claims checked against supplied material |
| Layout | Target-size review, clipping and safe-area inspection at motion extremes |
| Audio, if present | Stream metadata, sync anchors, listening observations, tail integrity |
| Provenance | Sources, licenses, attribution, generated-asset status where applicable |

A few sampled frames cannot prove every frame is correct. Describe the sampling performed. Use broader automated checks when warranted, without overstating what those checks establish.

## Delivery note

Keep the handoff short and concrete:

```text
Artifact: [relative output path or authorized artifact link]
Source: [relative composition path]
Spec: [actual size, duration, frame rate, format; audio status]
Verified: [commands/checks and what was viewed or heard]
Creative assessment: [specific observations tied to the brief]
Limitations: [unreviewed playback/audio, technical gaps, assumptions]
Approval needed: [one precise direction question, or none outstanding]
```

Include a storyboard when it helps the recipient inspect the work. Provide source and the actual reproduction command, not just an exported video. Keep generated renders out of git under normal project policy. Do not include secrets, host-specific paths, or implicit permission to publish.

“Rendered successfully,” “reviewed locally,” and “approved by the human” are different outcomes. Report only the outcomes supported by evidence.
