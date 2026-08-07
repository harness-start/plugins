# CLI contract

## Canonical layouts

The guard accepts exactly one of these Git-root layouts:

1. `AGENTS.md` is a regular UTF-8 file containing one ordered managed block, and `CLAUDE.md` is the exact relative symlink `AGENTS.md`.
2. `README.md` is the regular UTF-8 instruction source containing one ordered managed block, while both `AGENTS.md` and `CLAUDE.md` are the exact relative symlink `README.md`.

The markers are:

```text
<!-- ai-experts:project-instructions:start -->
<!-- ai-experts:project-instructions:end -->
```

The source is limited to 1 MiB. Managed content is limited to 32 KiB and 400 lines.

## Receipts

Every successful action emits one JSON object with schema `project-instruction-receipt/v1`. Common fields are `toolId`, `invocationId`, `ok`, `observedAt`, `observationDigest`, `provenance`, and `result`.

- `inspect` returns the canonical source, path states, findings, validity, and `stateDigest`.
- `reconcile` returns `changed`, `revisionId`, before/after digests, and the resulting state.
- `verify` returns `decision`, `stateDigest`, findings, and revision lineage when applicable.
- `rollback` returns a new rollback `revisionId`; it never reuses the source revision ID.

For changed or rollback verification, `--verifies-invocation-id` must name the mutating receipt's invocation ID. This creates an auditable receipt chain for the hook.

## Rollback

First inspect the current state, then run:

```bash
AI_EXPERTS_SESSION_ID="${AI_EXPERTS_SESSION_ID:-${CODEX_THREAD_ID:-${CLAUDE_SESSION_ID:-manual}}}" AI_EXPERTS_TRIGGER_FROM="skill:project-instruction-maintenance" node "/absolute/plugin/scripts/project-instructions-cli.mjs" rollback --workspace "/absolute/repo" --expected-state-digest "<current-stateDigest>" --revision-id "<source-revisionId>"
```

Finally run `verify --decision rollback` with the new rollback revision ID and rollback invocation ID.

Only the revision whose after digest still matches the current instruction state can be rolled back. This prevents an old snapshot from overwriting later project-authored changes.

Revision manifests live below the repository's private Git path at `harness-start/project-instruction-guard/revisions`. They are not project files and must not be committed.
