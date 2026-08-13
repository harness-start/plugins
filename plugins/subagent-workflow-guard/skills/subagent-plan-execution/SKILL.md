---
name: subagent-plan-execution
description: "Execute an implementation plan through application-bound implementers, independent reviewers, and deterministic run closure."
---

# Subagent Plan Execution

Use this skill when an implementation plan is already decision complete and subagent isolation or parallelism has a concrete benefit. After `$reasoning-discipline` selects a behavior-changing contract, or after `$debug-workflow` / a delivery guard reaches implementation, open a governed run here instead of implementing in the parent session.

## Start

Open one run with the bundled CLI. Do not add `--host` in a normal platform session: Claude persists the authoritative host and Codex derives it from `CODEX_THREAD_ID`.

```bash
SWG_PLUGIN_ROOT="${SUBAGENT_WORKFLOW_GUARD_ROOT:-${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}}"
if [ -z "$SWG_PLUGIN_ROOT" ]; then
  for SWG_CANDIDATE in "${CODEX_HOME:-$HOME/.codex}"/plugins/cache/harness-start/subagent-workflow-guard/*; do
    [ -f "$SWG_CANDIDATE/scripts/subagent-workflow.mjs" ] && SWG_PLUGIN_ROOT="$SWG_CANDIDATE"
  done
fi
test -f "$SWG_PLUGIN_ROOT/scripts/subagent-workflow.mjs"

AI_EXPERTS_SESSION_ID="${AI_EXPERTS_SESSION_ID:-}" \
AI_EXPERTS_TRIGGER_FROM="subagent-plan-execution:open" \
node "$SWG_PLUGIN_ROOT/scripts/subagent-workflow.mjs" run-open \
  --cwd "$PWD" --run-id "<run-id>"
```

The parent owns the plan, user decisions, shared interfaces, working-tree reconciliation, overall verification, and final response.

The CLI requires a session identity. Claude `SessionStart` persists `AI_EXPERTS_SESSION_ID` for later Bash commands through `CLAUDE_ENV_FILE`, while Codex normally supplies `CODEX_THREAD_ID`; otherwise pass `--session`. Offline requests are stored in a host- and session-hashed Git-private mailbox and cannot be imported by another session. A conflicting explicit `--host` is rejected instead of writing to another platform's mailbox.

## Task loop

For each task:

1. Use `subagent-handoff` to register an `implementer` application.
2. Dispatch a fresh implementer with only the returned marker and a short instruction to read its application.
3. Require its Result Card. Treat `NEEDS_CONTEXT` and `BLOCKED` as real outcomes, not completion.
4. Register and dispatch a fresh `spec-reviewer` with `reviewFor` set to the implementer ID.
5. Register and dispatch a fresh `quality-reviewer` with the same `reviewFor`.
6. Send concrete findings back through a new scoped fix application. The producer may mark a finding `fixed_pending_recheck`; only the original reviewer or an independent verifier may mark it `verified`.
7. Stop after two fix/review rounds. Remaining blocker or major findings make the run `BLOCKED`; minor findings may become `DONE_WITH_CONCERNS`.

The finding ledger fields are:

```text
finding_id | reviewer | severity | source_kind | confidence | root_cause_key | evidence | evidence_anchor | verified_against_artifact | fix | status | recheck_evidence
```

`status` is `open`, `fixed_pending_recheck`, or `verified`.

## Parallel dispatch

Run tasks in parallel only when they have no unfinished dependency, overlapping write scope, or shared mutable resource. Keep at most three active companions. Parallel writers use isolated worktrees; read-only reviewers may share the integrated workspace. Each dispatch needs its own application and nonce.

After merging parallel work, run the relevant integrated test suite. A worker's Result Card is scoped evidence, not parent completion evidence.

## Final review and close

After all task reviews are delivered, dispatch a fresh `final-reviewer` over the integrated diff and complete verification evidence. Then close the run:

```bash
AI_EXPERTS_SESSION_ID="${AI_EXPERTS_SESSION_ID:-}" \
AI_EXPERTS_TRIGGER_FROM="subagent-plan-execution:close" \
node "$SWG_PLUGIN_ROOT/scripts/subagent-workflow.mjs" run-close \
  --cwd "$PWD" --status DONE
```

When the session and plugin data variables are present, `--session "$AI_EXPERTS_SESSION_ID"` may be added for direct state access. Use `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED` when that is the evidenced outcome. Preparing the final reviewer seals the application graph; no later application is accepted. The exact user-only escape is `SUBAGENT_WORKFLOW_ABORT <run-id>`; do not issue it on the user's behalf.
