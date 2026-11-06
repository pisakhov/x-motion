# X Motion

Skill-first, portable motion-design craft for coding agents. Original work inspired by LangChain Content Studio; not a fork or affiliated product.

- Read `skills/x-motion/SKILL.md` before creative work.
- Taste is contextual: one visual thesis, designed typography, motivated motion and sound. Never substitute a template collection for art direction.
- Use deterministic timestamp rendering. No network assets, credentials, unseeded randomness or wall-clock state in compositions.
- Separate measurable checks from human aesthetic approval. Never invent ratings or claim a render was watched when it was not.
- Keep dependencies pinned, working renders out of git, and asset provenance explicit. Deliberate exception: small published video/poster snapshots in `gallery-media/` are tracked for reproducible deployment.
- Public gallery feedback arrives in X chat by permanent `XM-0001`-style video ID. Never reuse an ID or replace its assets: revisions get new IDs with `parentId`. Record feedback via the catalog CLI; discarded videos stay in history but leave the deployed gallery. Read `docs/FEEDBACK.md` before handling feedback. No automated taste approval.
- Small tested changes on branches; review before merging. Preserve unrelated work.
- No paid services, external publishing or model calls without user authority. Local rendering is allowed.
