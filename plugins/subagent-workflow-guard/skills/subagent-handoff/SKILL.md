---
name: subagent-handoff
description: "Prepare and register the scoped application required before a governed subagent dispatch."
---

# Subagent Handoff

Use this skill before every subagent dispatched as part of an active `subagent-plan-execution` run.

## Contract

Keep the user's goal, global decisions, working-tree ownership, integration, and final verification in the parent session. The application contains only the subtask context that cannot be recovered from its references.

Write the draft in an OS temporary directory. Reference existing plans, issues, ADRs, commits, diffs, and source paths instead of copying them. Remove credentials, cookies, tokens, private keys, personal data, and unrelated conversation text.

The application JSON is limited to 32 KiB:

```json
{
  "id": "task-1-implement",
  "runId": "run-1",
  "role": "implementer",
  "objective": "One bounded outcome",
  "nonGoals": ["Explicit exclusions"],
  "references": ["docs/plan.md", "src/module.mjs"],
  "acceptance": ["Observable condition"],
  "dependencies": [],
  "writeScope": ["src/module/**", "tests/module/**"],
  "reviewFor": null,
  "requiredEvidence": ["Targeted test output"]
}
```

Review applications set `reviewFor` to the implementer application ID and use an empty `writeScope`. A final reviewer uses `reviewFor: null`.

Register the draft with the bundled CLI. Resolve the installed plugin once; interactive shells do not always receive hook-only plugin variables, so the CLI uses a host- and session-hashed private Git mailbox when direct plugin data is unavailable. Claude `SessionStart` persists `AI_EXPERTS_SESSION_ID` through `CLAUDE_ENV_FILE`, and Codex derives it from `CODEX_THREAD_ID`; otherwise provide `--session` explicitly:

```bash
SWG_PLUGIN_ROOT="${SUBAGENT_WORKFLOW_GUARD_ROOT:-${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}}"
if [ -z "$SWG_PLUGIN_ROOT" ]; then
  for SWG_CANDIDATE in "${CODEX_HOME:-$HOME/.codex}"/plugins/cache/harness-start/subagent-workflow-guard/*; do
    [ -f "$SWG_CANDIDATE/scripts/subagent-workflow.mjs" ] && SWG_PLUGIN_ROOT="$SWG_CANDIDATE"
  done
fi
test -f "$SWG_PLUGIN_ROOT/scripts/subagent-workflow.mjs"

AI_EXPERTS_SESSION_ID="${AI_EXPERTS_SESSION_ID:-}" \
AI_EXPERTS_TRIGGER_FROM="subagent-handoff:prepare" \
node "$SWG_PLUGIN_ROOT/scripts/subagent-workflow.mjs" prepare \
  --cwd "$PWD" --file "/tmp/subagent-application.json"
```

Claude `SessionStart` supplies `SUBAGENT_WORKFLOW_GUARD_HOST`, `SUBAGENT_WORKFLOW_GUARD_ROOT`, and `AI_EXPERTS_SESSION_ID` to later Bash commands. Do not add `--host` in a normal platform session; a value that conflicts with the persisted host is rejected. Under a controlled script with the current host's plugin data variable, add explicit `--session "$AI_EXPERTS_SESSION_ID"` only when direct state access is intended. Otherwise the same-session mailbox is the safe default. The CLI refuses a mailbox request without a session identity, and only a hook from the same session can import it. Copy the returned `SUBAGENT_APPLICATION <id> <nonce>` marker into the dispatch prompt. Keep that prompt under 2 KiB and point the worker to the application artifact rather than restating it. On Codex 0.147+, the dispatch `task_name` must exactly equal the application ID and use only lowercase letters, digits, and underscores so `SubagentStart` can correlate the child session without prompt metadata.

Do not reuse a marker, dispatch before dependencies are delivered, or place two parallel writers over the same scope. If registration rejects suspected secret material, rewrite the application with references and register again.

For a manual cross-session transfer rather than an automatic subagent dispatch, use the installed upstream `handoff` skill directly.
