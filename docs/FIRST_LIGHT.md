# First Light: reproducible study

Read the [creative brief](../examples/first-light/brief.md). The scene is original code authored with GPT-6 Astra after the requested Opus 5.5 session hit its usage limit before producing the example. Opus 5.5 remains the recommended creative author for future work; this sample is not evidence of its output. It is a craft sample, not evidence that every future prompt produces good work.

## Render

```sh
npm run storyboard
npm run render
```

Inspect the storyboard PNGs before full export. Watch the entire MP4, including the last hold; frame inspection alone does not establish pacing quality. Never declare the result human-approved until it is.

## Optional original sound

The renderer intentionally exports silently. This separate, seeded PCM synthesis creates a restrained low mechanical bed, an air swell and a short resolved harmonic accent, with a six-second timeline. No recordings, generated voices or licensed music samples are used.

```sh
node scripts/first-light-audio.mjs renders/first-light/sound.wav
# Substitute the MP4 filename reported by the renderer if necessary.
ffmpeg -n -i renders/first-light/film.mp4 -i renders/first-light/sound.wav \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k \
  -t 6 -movflags +faststart renders/first-light/film-sound.mp4
```

The WAV has a measured sample-peak target of −6 dBFS, **not** a certified integrated-loudness or true-peak target. Listen on headphones and phone speakers, align accents to the final picture and check the encoded mix before delivery. For a brief requiring another rhythm, change the cue times rather than stretching audio blindly. Keep a silent export and do not autoplay sound on the web.

## Evidence

A render manifest records technical output. Exact reproducibility depends on the pinned browser, OS and available system fonts; timestamp determinism is tested within the same render environment, not promised across all machines. The sample uses system typography; production projects should bundle licensed font files for consistent metrics.
