# command-exec-audit design

## Responsibility

Record agent **shell** commands with **status + duration only** (no stdout/stderr body) into a project-local, per-session JSONL trail. Protect that trail from agent rewrites.

## Layout

```text
.command-exec-audit/
  README.md
  sessions/<session_key>.jsonl
```

## Write policy

| Actor | Allowed |
| --- | --- |
| Plugin | Append; rewrite **last line only** when pending `tool_use_id` matches |
| Agent tools | No mutation of the audit root |

If Post cannot rewrite the tip (parallel tools), append a terminal row instead. Never rewrite non-last lines.

## Duration model

1. PreToolUse → append `status: "pending"` with `started_at`
2. PostToolUse / PostToolUseFailure → tip rewrite to terminal with `ended_at`, `duration_ms`, `status`, optional `exit_code` when the tip is a pending row with the **same non-empty** `tool_use_id`
3. If tip rewrite is unavailable (parallel tools, empty id, lock miss) → append a terminal row; recover `started_at` by scanning earlier pending rows for that non-empty id (never rewrite non-last lines)

Empty/`null` `tool_use_id` never participates in tip rewrite matching.

## Schema `command-exec/v1`

```json
{
  "schema": "command-exec/v1",
  "ts": "ISO-8601",
  "session_id": "string|null",
  "cwd": "string",
  "tool_name": "string",
  "tool_use_id": "string|null",
  "command": "string",
  "status": "pending|success|failure|unknown",
  "started_at": "ISO-8601",
  "ended_at": "ISO-8601|null",
  "duration_ms": "number|null",
  "exit_code": "number|null",
  "host": "claude|codex|unknown"
}
```

No `stdout`, `stderr`, or raw `tool_response` fields. Without an explicit exit/success signal, `status` is `unknown` (not invented success).

## Redaction

Best-effort: `TOKEN=…`, Bearer tokens, etc. Truncate to `maxCommandChars` (default 2000).

## Config

```js
export default {
  enabled: true,
  auditRoot: ".command-exec-audit",
  maxCommandChars: 2000,
  redactSecrets: true,
};
```

## Non-goals

- Full command output capture
- Human terminal sessions outside agent tools
- Automatic `.gitignore` changes
- True WORM storage
