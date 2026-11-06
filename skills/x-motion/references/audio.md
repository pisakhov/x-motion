# Audio: compose the relationship, not a sound-effect layer

## Decide what sound does

Sound can orient, create anticipation, emphasize a change, establish material character, or provide continuity across a cut. Silence can do the same. Do not attach a whoosh to every movement or let a music track dictate meaning by accident.

Establish whether the piece must work muted, whether narration carries essential information, and what playback setting is expected. Keep essential visual communication intact for silent-first delivery. Provide captions or a transcript where needed.

Use only assets with known rights. Record the source, license, modifications, and attribution requirements. Generated audio, voices, and paid services require appropriate authority and rights; this skill does not supply them. Mark scratch tracks clearly so they cannot accidentally ship.

## Build a cue map

Use the same time origin as the visual timeline:

| Cue | Time / duration | Visual relationship | Mix role | Source |
| --- | --- | --- | --- | --- |
| A named event | Seconds | Leads, meets, or follows a specific action | Foreground, support, ambience, or silence | Local asset and license record |

A sound need not begin on the same frame as an object. Anticipation may lead the reveal; an impact may meet the contact; a tail may extend into the hold. Make the relationship intentional and verify it in the exported result.

Choose a few meaningful anchors rather than quantizing every motion to a beat. Align the perceived transient, not merely the start of an audio file that may contain leading silence.

## Mix for the message

Prioritize intelligibility when there is speech. Reduce competing layers instead of merely increasing everything's volume. Use fades where needed to avoid clicks and keep ambience changes intentional. Check the opening, quiet passages, loudest event, and final tail.

Choose loudness and peak targets from delivery requirements; there is no single correct loudness for every platform. Measure with an available analyzer when targets exist, and report units and method. Do not claim a listening judgment from a waveform or a metric.

## Synchronization and export

Keep cues expressed in seconds or explicit frame indices with a documented frame rate. Avoid implicit conversions or rounding in multiple places. If external editing or muxing is needed, preserve the timeline start and account for any intentional offset.

The HTML `renderFrame(tSeconds)` contract controls visuals. It does **not** promise audio recording or mixing. Confirm what the local renderer supports before planning export. If no audio pipeline is available, deliver a silent preview and cue map, clearly labeling audio as unfinished rather than implying it was embedded.

After final encoding:

- Inspect whether an audio stream exists when expected, and whether its duration covers the intended cues and tail.
- Listen to the actual export, not only source assets or browser playback.
- Check synchronization at an early and a late anchor to detect both offset and drift.
- Check for clipping, unintended silence, clicks, truncated tails, or distracting repetition.
- Check speech intelligibility and, where feasible, small-speaker and mono compatibility.

If listening is unavailable, report technical measurements separately and mark listening review outstanding. Muted preview playback is not audio verification.
