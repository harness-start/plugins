# first-principles-gate

Dual-host (Claude Code / Codex) plugin that enforces a **first-principles analysis session** before business writes:

1. **Enter** when the user prompt **starts with** `/first-principles` or `$first-principles` only (short aliases like `/fp` are **not** entries).
2. While **open**, block non-ledger file/shell mutations (allow `.first-principles/**` and `docs/decisions/**`).
3. Require an on-disk **structured ledger** (`.first-principles/ledger.json`) with schema `first-principles/v1`.
4. On **Stop**, soft-report incomplete ledgers mid-session; **block** when the assistant claims completion or the user closed with `done` without a valid ledger.
5. Escape with `# first-principles-abort`. Corrupt state / TTL / aborted / idle → **fail-open** (no permanent write lock).

## Install

Via marketplace `harness-start` (see repo root README) or local plugin path.

## Config

Optional project root file (trusted `import()`):

- `.first-principles-gate.mjs` / `.cjs` / `.js`

See `skills/first-principles-gate-config/` and [DESIGN.md](./DESIGN.md).

## Ledger skill

Bundled `first-principles-ledger` skill documents the minimal JSON schema and recovery steps for Stop blocks.

## Hooks

| Event | Role |
|-------|------|
| UserPromptSubmit | Entry + classify + inject |
| PreToolUse | Write-block while open |
| PostToolUse | Ledger revision bookkeeping |
| Stop | Soft report / completion ledger gate / implement-while-open block |

## Tests

```bash
node --test plugins/first-principles-gate/tests/*.test.mjs
bash plugins/first-principles-gate/acceptance/cases/01-open-deny-then-ledger-complete/run-fixture.sh
```
