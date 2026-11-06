# Provenance and boundaries

## Inspiration

- LangChain, A. Irgashev and S. Talegaonkar, [How We Built Our Design Agent](https://www.langchain.com/blog/design-agent), October 27, 2026.
- [langchain-ai/design-agent](https://github.com/langchain-ai/design-agent), including its README and NOTICE.

Borrowed **ideas**, expressed here in original instructions and code: taste needs explicit context; load task-specific skills progressively; inspect deterministic renders; separate technical gates from aesthetic judgment; stage film work through storyboard, animatic and production; preserve designer feedback with its reasoning; remove stale rules when model capabilities improve.

No upstream source, proprietary brand assets, reference-film collection, fonts, skills or animation engine have been vendored. We do not claim LangChain compatibility or affiliation. The upstream repository uses Apache-2.0 with separately licensed components; copying anything later requires a fresh license review and preservation of applicable notices.

## Local work

X Motion’s instructions, tooling and First Light scene are original contributions under the repository MIT license. The example uses procedural shapes and system fonts; no stock footage or cloned voice. Its visual identity is an example, not a mandate for future client work.

## Runtime dependencies

Playwright is pinned in `package-lock.json` and carries Apache-2.0 licensing. Chromium is downloaded separately under its own notices. FFmpeg is installed separately; licensing depends on its build and codec configuration. They are not relicensed by this repository. Distribution of rendered client assets also requires rights to every font, logo, image, music and voice used.
