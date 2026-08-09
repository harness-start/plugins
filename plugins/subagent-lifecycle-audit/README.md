# subagent-lifecycle-audit

`subagent-lifecycle-audit` records subagent lifecycle metadata for Claude Code
and Codex. It observes starts and stops, correlates them by host session and
`agent_id`, and blocks common direct agent attempts to mutate the project-local
trail.

It does not record prompts, responses, commands, file paths, tool names, or
tool input/output. A `stopped` observation means only that the host emitted
`SubagentStop`; it does not prove task success.

## Storage

```text
.subagent-lifecycle-audit/
  README.md
  sessions/<session_key>.jsonl
```

The plugin does not create or modify `.gitignore`; repository owners decide
whether to ignore `.subagent-lifecycle-audit/`. Session identifiers are path-normalized; when the host
omits one, a hash of the working directory is used as the session key.

Every line uses schema `subagent-lifecycle/v1`. Start and Stop observations are
appended rather than rewritten. Possible correlation states are:

| State | Meaning |
| --- | --- |
| `open` | Start observed; no matching Stop has been observed yet |
| `matched` | Stop paired with the most recent unmatched Start |
| `duplicate-start` | The same agent ID already had an unmatched Start |
| `orphan-stop` | Stop observed without a matching Start |
| `missing-agent-id` | The host event omitted a usable agent identity |

`open` can mean the subagent is still running or that its Stop event was not
observed. It is not reported as failure.

## Report

From the repository being audited, run the installed plugin script or this
repository-local equivalent:

```bash
node plugins/subagent-lifecycle-audit/scripts/subagent-lifecycle-report.mjs
node plugins/subagent-lifecycle-audit/scripts/subagent-lifecycle-report.mjs --session <session-id> --json
```

Use `--cwd <repository-path>` when the command is launched outside the target
repository. Without `--session`, the report reads every session JSONL file in
deterministic filename order.

## Integrity boundary

`PreToolUse` denies direct agent Edit/Write/apply_patch targets and recognized
shell mutation commands under the audit root. Read-only shell inspection is
allowed. This is best-effort hook-enforced tamper resistance, not WORM storage:
an indirect command, a human, or a process outside the agent hook path can
still alter or remove the files.

Lifecycle recording is fail-open. Malformed hook input, lock contention, or an
I/O failure is written to hook stderr and does not block the subagent. Trail
mutation attempts are fail-closed.

## Platform mapping

| Platform | Lifecycle hooks | Plugin root |
| --- | --- | --- |
| Claude Code | `SubagentStart`, `SubagentStop` | `CLAUDE_PLUGIN_ROOT` |
| Codex | `SubagentStart`, `SubagentStop` | `PLUGIN_ROOT` |

Codex commands set `AI_EXPERTS_SESSION_ID` and
`AI_EXPERTS_TRIGGER_FROM`; those values are retained as hook provenance.

Version: `0.1.1`

## Verification

From this marketplace repository root:

```bash
node --test plugins/subagent-lifecycle-audit/tests/*.test.mjs
SKIP_HOST_INSTALL=1 bash scripts/ci/validate-plugins.sh
./scripts/acceptance/run.sh --plugin subagent-lifecycle-audit
```
