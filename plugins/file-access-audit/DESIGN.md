# file-access-audit design

## Responsibility

Record **structured** agent file tool access (read/write/update/delete/move) into a project-local, per-session JSONL trail. Protect that trail from agent rewrites. Observe-only for ordinary business tools.

Does **not** track human IDE opens/saves. Does **not** parse Bash `cat` / redirects.

## Layout

```text
.file-access-audit/
  README.md
  sessions/<session_key>.jsonl
```

- One session → one file
- Paths repo-relative when under git root
- The plugin does not create or modify `.gitignore`

## Write policy

| Actor | Allowed |
| --- | --- |
| Plugin | Append; rewrite **last line only** (reserved; v1 is append-only for file events) |
| Agent tools | No mutation of the audit root |

Earlier lines are immutable by design. Agents that Edit/Write or shell-mutate the trail are denied on `PreToolUse`.

## Schema `file-access/v1`

```json
{
  "schema": "file-access/v1",
  "ts": "ISO-8601",
  "session_id": "string|null",
  "cwd": "string",
  "tool_name": "string",
  "tool_use_id": "string|null",
  "op": "read|write|update|delete|move",
  "paths": ["repo-relative-or-abs"],
  "host": "claude|codex|unknown"
}
```

## Hooks

| Event | Role |
| --- | --- |
| PreToolUse | Deny mutation of `.file-access-audit/` |
| PostToolUse | Append structured file access records |

Matchers cover `Read`, `Edit`, `MultiEdit`, `NotebookEdit`, `Write`, `apply_patch`.

## Config

Optional `.file-access-audit.mjs` at git root:

```js
export default {
  enabled: true,
  auditRoot: ".file-access-audit",
};
```

Fail-open on config/IO errors.

## Non-goals

- Bash-inferred IO
- File content capture
- SIEM shipping
- True WORM / human delete prevention
