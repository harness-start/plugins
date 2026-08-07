---
name: intent-clarify-gate-config
description: "Configure intent-clarify-gate entry tokens, write-block, and session TTL via project .intent-clarify-gate.mjs."
---

# Intent Clarify Gate Config

Place a trusted executable config at the Git repository root:

- `.intent-clarify-gate.mjs`
- `.intent-clarify-gate.cjs`
- `.intent-clarify-gate.js`

See [references/example-config.mjs](./references/example-config.mjs).

## Defaults

- Entry tokens: `/grill-me`, `$grill-me`, `/grilling`, `$grilling` (prompt **prefix** only)
- Write-block while `phase=open` for business paths; allow `.grill-ledgers/**`, `docs/decisions/**`
- Close on whole-message `done` or selecting `N. Done — …`
- `skillInstall.mode` defaults to `off` (safe offline/CI)
