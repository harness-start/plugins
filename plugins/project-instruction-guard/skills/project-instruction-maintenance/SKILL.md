---
name: project-instruction-maintenance
description: Maintain a Git repository's root AGENTS.md, CLAUDE.md, or shared README.md instruction source. Use after project files change, when SessionStart reports instruction drift, when Stop requires project-instructions-verify, or when migrating legacy root instructions without losing project-owned text.
---

# Project Instruction Maintenance

Maintain one bounded managed block while preserving all project-authored text outside it. Resolve this Skill's directory first; the executable is the regular file `../../scripts/project-instructions-cli.mjs`. Use its resolved absolute path literally in each `node` command so the guard can authenticate the invocation.

## Workflow

1. Run `inspect` and retain the full JSON receipt, especially `invocationId`, `result.stateDigest`, `result.instructionSource`, and `result.findings`.
2. Decide whether the managed block needs a change.
   - If structure or effective rules need repair, run `reconcile` with the inspected digest.
   - If authored rules need editing, prepare a regular UTF-8 candidate containing the complete desired source. Only the managed block may differ from the current source.
   - If no instruction change is needed, do not call reconcile.
3. Run `verify` after every project mutation and make it the final change-related command.
   - No instruction write: `--decision no-change`.
   - Reconcile write: `--decision changed`, with the reconcile `revisionId` and `invocationId`.
   - Rollback write: `--decision rollback`, with the rollback `revisionId` and `invocationId`.
4. Report the decision, source, state digest, revision lineage when present, and the verify receipt invocation ID.

Every command must set provenance. Replace `/absolute/plugin` and `/absolute/repo` with resolved absolute paths; do not add pipes, redirects, `&&`, or trailing shell commands.

```bash
AI_EXPERTS_SESSION_ID="${AI_EXPERTS_SESSION_ID:-${CODEX_THREAD_ID:-${CLAUDE_SESSION_ID:-manual}}}" AI_EXPERTS_TRIGGER_FROM="skill:project-instruction-maintenance" node "/absolute/plugin/scripts/project-instructions-cli.mjs" inspect --workspace "/absolute/repo"
```

Automatic reconciliation:

```bash
AI_EXPERTS_SESSION_ID="${AI_EXPERTS_SESSION_ID:-${CODEX_THREAD_ID:-${CLAUDE_SESSION_ID:-manual}}}" AI_EXPERTS_TRIGGER_FROM="skill:project-instruction-maintenance" node "/absolute/plugin/scripts/project-instructions-cli.mjs" reconcile --workspace "/absolute/repo" --expected-state-digest "<inspect-stateDigest>"
```

Candidate reconciliation:

```bash
AI_EXPERTS_SESSION_ID="${AI_EXPERTS_SESSION_ID:-${CODEX_THREAD_ID:-${CLAUDE_SESSION_ID:-manual}}}" AI_EXPERTS_TRIGGER_FROM="skill:project-instruction-maintenance" node "/absolute/plugin/scripts/project-instructions-cli.mjs" reconcile --workspace "/absolute/repo" --expected-state-digest "<inspect-stateDigest>" --candidate-file "/absolute/candidate.md"
```

No-change verification:

```bash
AI_EXPERTS_SESSION_ID="${AI_EXPERTS_SESSION_ID:-${CODEX_THREAD_ID:-${CLAUDE_SESSION_ID:-manual}}}" AI_EXPERTS_TRIGGER_FROM="skill:project-instruction-maintenance" node "/absolute/plugin/scripts/project-instructions-cli.mjs" verify --workspace "/absolute/repo" --decision no-change
```

Changed verification:

```bash
AI_EXPERTS_SESSION_ID="${AI_EXPERTS_SESSION_ID:-${CODEX_THREAD_ID:-${CLAUDE_SESSION_ID:-manual}}}" AI_EXPERTS_TRIGGER_FROM="skill:project-instruction-maintenance" node "/absolute/plugin/scripts/project-instructions-cli.mjs" verify --workspace "/absolute/repo" --decision changed --expected-revision-id "<reconcile-revisionId>" --verifies-invocation-id "<reconcile-invocationId>"
```

## Safety and recovery

- Never hand-edit symlinks, replace a non-canonical symlink, or modify text outside the managed block through a candidate.
- Treat stale state digests as a request to inspect again, not as a reason to bypass CAS.
- Stop and request user direction for malformed markers, conflicting effective rules, non-file root paths, or platforms that cannot create relative symlinks.
- A failed write is restored from a private Git revision. Use rollback only with the current state digest and a known committed revision, then verify the rollback.
- Do not include secrets, credentials, personal absolute paths, BOM, invalid UTF-8, or merge markers in managed content.

See [CLI contract](references/cli-contract.md) for receipt fields, canonical layouts, limits, and rollback commands.
