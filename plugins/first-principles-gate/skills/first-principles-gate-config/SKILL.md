---
name: first-principles-gate-config
description: "Change first-principles-gate project settings: write-block mode, entry tokens, ledger path, and Stop gate in .first-principles-gate.mjs."
---

# first-principles-gate-config

Manage the Git-root `.first-principles-gate.mjs` consumed by `first-principles-gate`.

Read `../../README.md` before changing the interface.

## Default shape

```js
export default {
  entryTokens: ["/first-principles", "$first-principles"],
  donePhrases: ["done"],
  abortToken: "# first-principles-abort",
  writeBlock: {
    mode: "block", // block | report | off
    ledgerAllow: [".first-principles/**", "docs/decisions/**"],
    allowSpecMd: true,
  },
  stopGate: {
    mode: "block", // block | report | off
    blockImplementWhileOpen: true,
    softReportWhileOpen: true,
  },
  ledger: {
    primaryRelativePath: ".first-principles/ledger.json",
    maxBytes: 256 * 1024,
  },
  sessionTtlHours: 24,
};
```

Invalid fields fall back to defaults. The plugin trusts `import()` of this file as project-owned executable config.
