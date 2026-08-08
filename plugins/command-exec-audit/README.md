# command-exec-audit

`command-exec-audit` records agent shell commands for Claude Code and Codex with **status and duration only** (no output body).

## Layout

```text
.command-exec-audit/
  README.md
  sessions/<session_id>.jsonl
```

One host session maps to one JSONL file. The directory is added to `.gitignore` by default.

## Lifecycle

1. **PreToolUse** appends a `pending` row (`started_at`)
2. **PostToolUse** (or Claude `PostToolUseFailure`) rewrites the **last line** when `tool_use_id` matches, filling `status`, `ended_at`, `duration_ms`, and optional `exit_code`
3. If the tip is not the matching pending row (parallel tools), a terminal row is **appended** instead — earlier lines stay immutable

## Write policy

- Append allowed
- Only the last line may be rewritten (by the plugin)
- Agent Edit/Write/shell mutation of the audit tree is denied

## Config

Optional `.command-exec-audit.mjs` at the Git root:

```js
export default {
  enabled: true,
  auditRoot: ".command-exec-audit",
  gitignoreEnsure: true,
  maxCommandChars: 2000,
  redactSecrets: true,
};
```

Use `command-exec-audit-config` Skill for initialization. Full contract: [DESIGN.md](./DESIGN.md).

## Verification

```bash
node --test plugins/command-exec-audit/tests/*.test.mjs
```

Version: `0.1.0`
