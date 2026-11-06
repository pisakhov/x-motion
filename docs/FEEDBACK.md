# Motion feedback and permanent identities

The gallery is a review surface; X chat is where the human gives feedback. There are no ratings, automatic aesthetic approvals, or public feedback forms. Measurable checks do not substitute for human taste.

## One authoritative record

`data/catalog.json` contains `{ "version": 1, "motions": [...], "feedback": [] }`. The optional `feedback` array is initialized on the first feedback command. Do **not** maintain a separate `data/feedback.json`: it is not read, written, or published by these tools. If it already contains events, deliberately migrate them into the catalog before use; there is no silent migration.

A feedback event contains `id`, ISO `timestamp`, `previousStatus`, `status`, and the exact `note`. Keeping event history and status in one document allows a single atomic file replacement rather than a fragile two-file transaction.

**This repository is public. Never put private personal details, credentials, or confidential material in feedback, metadata, or source files.** Feedback is excluded from the built website, not hidden from repository readers or Git history. If a chat message contains sensitive details, ask the human for a public-safe statement instead of recording it verbatim. Do not claim a paraphrase is their exact feedback.

## Chat → explicit decision → recorded feedback

1. Identify the permanent ID shown on the gallery card, such as `XM-0001`.
2. Confirm which ID and decision the human means when ambiguous. Do not infer approval from silence, rendering success, or test results.
3. Record their exact public-safe wording and explicit status:

   ```sh
   node scripts/catalog.mjs feedback XM-0001 --status improve --note 'Exact user feedback'
   node scripts/catalog.mjs list
   node scripts/catalog.mjs validate
   ```

   Quote notes as shell data, never interpolate untrusted chat into shell commands. When integrating programmatically, use `recordFeedback(root, id, status, note)` or a subprocess argument array.

4. Review the catalog diff. The feedback command changes only that motion's status and appends an event. It never changes the ID, title, source, media, or earlier events.
5. Rebuild and verify the preview. Publishing is a separate authorized action; neither tool uploads anything.

Statuses:

- `review`: awaiting a human decision.
- `kept`: explicitly retained by the human.
- `improve`: retained for revision, with the original still available.
- `discarded`: retained in the catalog and Git, omitted from the next public build together with its media.

All statuses remain explicit human decisions. A repeated status is permitted when recording additional feedback. Restoring a discarded item also requires an explicit human decision. Discard is not secure deletion: earlier deployments, caches, clones, or Git history may retain media.

## Revisions never overwrite originals

A creative revision gets a **new, unused ID**, new source composition, and new `/media/ID.mp4` and `/media/ID.webp` assets. Set `parentId` to the original motion's ID (or the specific revision being revised), and start it at `review`. Preserve the old entry, assets, and feedback. Never recycle an ID, including discarded IDs. The validator checks current uniqueness, parent existence, cycles, and required media digests; repository review must enforce historical non-reuse and immutable original asset content. Digest checks detect changed media against the catalog, but cannot detect someone deliberately replacing both an asset and its recorded digest. Never update an existing ID's digest to make an unintended replacement pass.

Every motion must have `videoSha256` and `posterSha256`: lowercase 64-character SHA-256 digests of its exact original media bytes, including discarded motions. Compute them when registering a new ID (for example, `sha256sum gallery-media/XM-0001.mp4 gallery-media/XM-0001.webp`). The full catalog validator hashes all media; builds hash active assets before copying and again in staging before replacing output. Missing, malformed, or mismatched digests fail closed. These scripts use only Node standard-library imports and require no `npm install`.

`gallery-media/ID.mp4` and `gallery-media/ID.webp` are intentionally tracked public gallery assets. Keep unrelated renders out of Git. Asset names must match the ID exactly. The validator accepts positive finite durations up to 3600 seconds, integer dimensions from 1–8192, and nonempty regular local media files up to 250 MiB (video) / 20 MiB (poster), rejecting symlinks. These are safety checks, **not** codec, resolution, duration, audio, or aesthetic verification; verify actual encoded media separately.

## Public build boundary

```sh
node scripts/build-site.mjs
# Optional independent preview directory:
node scripts/build-site.mjs --out dist-preview
node --test tests/catalog.test.mjs
```

The builder copies only `site/index.html`, `site/app.js`, and `site/style.css`, then generates `dist/catalog.json` and `dist/media/`. The public catalog includes only `version` and non-discarded `motions`, projected onto:

`id`, `title`, `description`, `status`, `duration`, `width`, `height`, `video`, `poster`, `parentId`, `createdAt`, `hasAudio`.

It excludes source paths, digest bookkeeping, feedback events, notes, and unknown metadata fields. It copies only those motions' exact ID-mapped assets, never the whole media directory. Public parent IDs may refer to discarded motions absent from the public catalog; the UI must tolerate that. Root-relative `/media/` URLs assume deployment at the origin root.

The output defaults to `dist`; `--out` accepts only immediate `dist-NAME` directories, not arbitrary paths. Existing output must carry the tool's `.x-motion-build.json` marker. Unmarked directories and output symlinks are refused. A staged rebuild replaces the whole previous generated output so discarded assets cannot linger. Source validation and copying finish before the old output is moved; a failed final rename attempts to restore the previous build. There can be a brief output-directory gap during the swap: deploy completed artifacts, do not serve the build directory during replacement. No source or Git files are deleted.

## Failure safety

Feedback writers acquire `data/catalog.json.lock` exclusively, validate the complete catalog, write and sync a unique sibling temporary file, then rename it over the catalog. Concurrent cooperating writers fail closed rather than lose updates; retry only after the successful writer finishes. Invalid arguments, missing IDs, malformed catalogs, or pre-rename write failures leave the authoritative bytes unchanged. Manual edits do not participate in the lock and must not run concurrently. This is atomic local-file replacement, not a database or a guaranteed power-loss-durable transaction.

Builds similarly acquire `.build-site.lock`. A crash can leave a lock or uniquely named staging/backup directory. Inspect it and ensure its owning process has stopped before manually recovering the exact leftover; never automatically remove a lock or broadly prune directories. A crash after catalog rename may have already recorded the event, so inspect the catalog before retrying to avoid duplicate feedback. A crash during a build swap may require restoring the exact `.site-previous-*` directory.

## Learning from feedback

Recording an event does not automatically rewrite a skill. Separately review the human's feedback for an explicit, reusable lesson, distinguish project-specific taste from a general motion-design principle, and update the actual relevant skill only when supported by the human's intent. Keep one-off preferences attached to their motion. Never invent an aesthetic score, infer universal taste from one discard, or claim the human approved something they did not review.
