---
name: claude-delegate
description: "Delegate a bounded coding implementation to a separate Claude Code CLI session, then review its diff and land it from the parent. Use only when the user explicitly asks for another Claude or the claude CLI to implement. Do not trigger because the current agent is Claude, for direct implementation, or for automatic provider selection."
version: "1.1.0"
license: "MIT"
metadata:
  upstream: "amelnagdy/delegate-skills@f36c3db8f80a29ac064cdc6d1dd8f5c63a6c84ef"
  verification: "offline-protocol-only"
---

# Claude Delegate

## When to use

- The user explicitly asks the parent to have a separate Claude Code CLI process implement, fix, or refactor a bounded coding task.

## Constraints

- The parent owns the brief, review, verification, and authorized landing; the Claude implementer must not commit, stage, or push.
- Do not install or authenticate the claude CLI. Permission bypass requires explicit human approval for that run.
- This integration is protocol-tested offline and has not been live-verified against a real Claude provider session in this release.

Use one explicit provider through the owner CLI. Do not call the private relay directly and do not start a provider fleet.

## Workflow

1. Inspect repository instructions and write one self-contained brief with the outcome, scope, exclusions, evidence, actual gates, and report contract. Copy load-bearing `AGENTS.md` constraints into the brief because Claude Code does not generically discover that file. State that the implementer must not commit, stage, or push.
2. Confirm that the user explicitly requested delegation to another Claude session. Check only for an existing authenticated `claude` CLI; do not install or authenticate it.
3. Dispatch from the target Git worktree:

```bash
DELEGATE_PLUGIN_ROOT="$PLUGIN_ROOT"
test -n "$DELEGATE_PLUGIN_ROOT" || DELEGATE_PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT"
node "$DELEGATE_PLUGIN_ROOT/dist/cli/harness.mjs" delegate claude \
  --brief brief.txt --cd "$PWD"
```

The normal profile uses `acceptEdits`, a restricted built-in tool surface, disabled MCP/skills/Agent access, and the supported-platform shell sandbox. Use `--read-only` for plan mode with Read/Glob/Grep only. Use `--session <id>` or `--resume-last` for delta rework. Pass `--dangerously-skip-permissions` only after the human explicitly accepts bypass mode; direct file tools then cross normal permission boundaries even though other relay restrictions remain.

4. Wait for process exit and inspect the printed `result.json`. Dirty worktrees are allowed. Review `harnessAudit`; final-state changes cannot be attributed under concurrency. A changed HEAD or index is a failed boundary.
5. Read the full diff, including staged and untracked state, and re-run the real project gates. Do not trust the implementer's report as proof.
6. Resume with a delta brief when needed. The parent lands only within the user's authorization and never pushes without a separate request.

Claude's shell sandbox governs shell processes, while direct tools follow the permission profile. Local or managed settings may affect the effective boundary. The audit excludes ignored paths, submodule internals, perfect restores, and concurrent-write attribution.
