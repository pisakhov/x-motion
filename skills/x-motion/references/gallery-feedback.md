# Learning from identified films

Use this when the human names a published motion-video ID (such as `XM-0001`) and gives feedback. Read the host project's gallery registry and feedback instructions first. In the X Motion clone these are `data/catalog.json` and `docs/FEEDBACK.md` at the repository root.

1. Resolve the exact ID, its assets, source, status, and parent lineage. Watch/review the relevant beat before changing it. An ID identifies one immutable video, not a moving latest version.
2. Preserve the human's intended change and what they liked. Ask only when feedback is consequentially ambiguous. Do not interpret silence as approval or rejection.
3. Record the feedback and a human-supported disposition: review, kept, improve, or discarded. Keep private/personal material out of public repositories; use a faithful non-sensitive paraphrase when necessary and disclose that choice.
4. For improvement, preserve the old film and give the new render a new ID linked through `parentId`. Record its source and asset hashes. Retest the affected beats and neighbors, publish through the project's authorized flow, and return the new ID alongside the original.
5. For discard, remove it from the active gallery/build. Retain the ID, reason and source history so the same failed idea is not accidentally presented as new. Discard is not a promise of erasure from Git history or browsers that already downloaded it.
6. Separate a clip-specific edit from a reusable lesson. “Slow this reveal” does not mean all future films should be slow. If feedback establishes a repeatable preference, update the appropriate craft reference or project preference, with its scope and exceptions; do not replace craft with a brittle preset.
7. Close the loop with concrete evidence: what changed, what remained, old/new IDs, verification, and what still requires human judgment. A film can be technically valid and aesthetically rejected.

No scheduled generation or indefinite revision loop is implied. Respond to the human's actual feedback; keep revision attempts bounded by the skill's critique process.
