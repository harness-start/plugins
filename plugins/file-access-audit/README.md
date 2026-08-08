# file-access-audit

`file-access-audit` records structured agent file reads and writes for Claude Code and Codex into a project-local JSONL trail.

## What is recorded

| Source | Operation |
| --- | --- |
| Claude `Read` | `read` |
| Claude `Edit` / `MultiEdit` / `NotebookEdit` | `update` |
| Claude `Write` | `write` |
| Codex `apply_patch` | `write` / `update` / `delete` / `move` from patch headers |

Shell-only IO (`cat`, redirects) is **not** recorded.

## Layout

```text
.file-access-audit/
  README.md
  sessions/<session_id>.jsonl
```

One host session maps to one JSONL file. The directory is added to `.gitignore` by default.

## Write policy

- The plugin may **append** lines
- The plugin may rewrite **only the last line**
- Agents must not Edit/Write or shell-mutate the audit tree (PreToolUse deny)

## Config

Optional `.file-access-audit.mjs` at the Git root:

```js
export default {
  enabled: true,
  auditRoot: ".file-access-audit",
  gitignoreEnsure: true,
};
```

Use the bundled `file-access-audit-config` Skill to initialize or diagnose configuration. Full contract: [DESIGN.md](./DESIGN.md).

## Verification

```bash
node --test plugins/file-access-audit/tests/*.test.mjs
```

Version: `0.1.0`
