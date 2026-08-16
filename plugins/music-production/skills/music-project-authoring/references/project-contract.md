# Project contract

## Ownership and stages

`plan.brief.json`, `plan.direction.json`, `plan.arrangement.json`, `plan.skill-composition.json`, `music.project.json`, and `src/**` are author-owned source while `targetStage` is `source`. `plan.contract.json` is protected and advances only through `project-stage.mjs` after a current independent approval.

`src/composition.mjs` is trusted deterministic executable configuration. It cannot access network, wall-clock time, unseeded randomness, rendering, recording, or transport lifecycle. Instrument modules create local Tone.js nodes connected to the supplied output; they cannot call `toDestination()` or own transport/render lifecycle.

## External advisers

Only current-source dependencies declared in `skill-deps.json` may be selected. At most three may be active in one phase. External skills have no project writer, review, or release authority. A used adviser needs a distinct controlled evidence artifact. General advice uses `evidence/skills/<name>.json` bound to the current subject digest. A source-analysis brief instead requires `musical-dna` and `evidence/reference-profile.<briefSha256>.json`, bound to a 3–5 item external source manifest without copying source identities into the project.

## Digest and writer chain

The subject digest covers the engine version and all audio-affecting source and plan files, but excludes the stage-only contract, generated artifacts, review, receipts, and journal. Any creative or engine change invalidates old score, metrics, render, preview, review, and release.

Protected outputs are `plan.contract.json`, `build/`, `proofs/`, `evidence/`, `review.music.json`, `dist/`, release manifest, receipt, and journal. Mutating CLI entrypoints consume one-shot capabilities issued only by the PreToolUse hook for an exact command, project, argv, session, and subject digest.

`project-preview.mjs` must consume the current render and must not call the renderer. Its evidence records objective analysis and availability for audition, not proof of listening.

## Review and release

Review must come from a session different from the one recorded by the current render receipt. Coverage binds score, metrics, render receipt, preview, mix, and every stem by SHA-256. Source-analysis projects also bind the current anonymous reference profile and require `reference-profile-alignment`. Approval requires every declared musical/technical check to pass and all blocker/major findings to be independently verified.

Release format is PCM16 WAV, 48 kHz stereo. Objective limits cover peak, RMS, DC offset, clipped samples, duration, and non-silent ratio for mix and stems. They supplement rather than replace listening.

Writers create `.music-delivery-journal.json` before multi-file mutation and remove it only after success. If it remains, reconcile the named operation and partial outputs; never bypass the guard or delete it without recovery evidence.
