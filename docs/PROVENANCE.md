# Provenance and boundaries

## Inspiration

- LangChain, A. Irgashev and S. Talegaonkar, [How We Built Our Design Agent](https://www.langchain.com/blog/design-agent), October 27, 2026.
- [langchain-ai/design-agent](https://github.com/langchain-ai/design-agent), including its README and NOTICE.

Borrowed **ideas**, expressed here in original instructions and code: taste needs explicit context; load task-specific skills progressively; inspect deterministic renders; separate technical gates from aesthetic judgment; stage film work through storyboard, animatic and production; preserve designer feedback with its reasoning; remove stale rules when model capabilities improve.

No upstream source, proprietary brand assets, reference-film collection, fonts, skills or animation engine have been vendored. We do not claim LangChain compatibility or affiliation. The upstream repository uses Apache-2.0 with separately licensed components; copying anything later requires a fresh license review and preservation of applicable notices.

## Local work

X Motion's instructions, tooling, theme skills and films are original contributions under the repository MIT license. Every film is procedural code: shaders, canvas drawing and Web Audio synthesis with seeded noise and synthetic reverb. There are no stock images, footage, samples, recorded sounds, cloned voices or third-party textures. The Orbit theme takes its emotional starting point from the owner's own X-Agent console login sequence, described in words and rebuilt from scratch; no code or assets were copied from it.

The retired studies XM-0001 to XM-0003 (First Light, Signal Weave, Weight of Type) remain in Git history and the catalog as discarded records.

## Fonts

The gallery self-hosts Geist and Geist Mono variable fonts from the `geist` npm package (version 1.9.2) by Vercel, under the SIL Open Font License 1.1. The license ships beside them as `site/fonts/OFL.txt`. The films use no fonts.

## Runtime dependencies

Playwright is pinned in `package-lock.json` and carries Apache-2.0 licensing. Chromium is downloaded separately under its own notices. FFmpeg is installed separately; licensing depends on its build and codec configuration. They are not relicensed by this repository. Distribution of rendered client assets also requires rights to every font, logo, image, music and voice used.
