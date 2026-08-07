# intent-clarify-gate

Dual-host (Claude Code / Codex) plugin that enforces **grill-me style intent clarification** before business writes.

Implements the workflow in [`docs/grill-me-hooks-design.md`](./docs/grill-me-hooks-design.md) (v3.1):

1. **Enter** when the user prompt **starts with** `/grill-me`, `$grill-me`, `/grilling`, or `$grilling`.
2. While **open**, block non-ledger file/shell mutations.
3. Classify user replies: `1|2|3`, `N` + note, free-text constraint, `完成`, or `# grill-abort`.
4. On **Stop**, parse `N. 完成 — …` as the complete option; selecting that `N` closes the session.
5. Corrupt state / TTL / closed / idle → **fail-open** (no permanent write lock).

## Install

Via marketplace `harness-start` (see repo root README) or local plugin path.

## Config

Optional project root file (trusted `import()`):

- `.intent-clarify-gate.mjs` / `.cjs` / `.js`

See `skills/intent-clarify-gate-config/`.

Default `skillInstall.mode` is **`off`** (offline/CI safe).

## Hooks

| Event | Role |
|-------|------|
| UserPromptSubmit | Entry + classify + inject |
| PreToolUse | Write-block while open |
| Stop | completeChoice parse; block implement-while-open claims |

## Tests

```bash
node --test plugins/intent-clarify-gate/tests/intent-clarify-gate.test.mjs
```
