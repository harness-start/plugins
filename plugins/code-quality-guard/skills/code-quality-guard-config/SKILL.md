---
name: code-quality-guard-config
description: >
  Initialize, inspect, edit, and diagnose .code-quality-guard.mjs. Use when a
  user wants to change syntax or lint modes, add path exceptions, tune bounded
  execution limits, or diagnose ESLint, esbuild, Ruff, Composer, PHP, or PHPStan
  discovery. Triggers: /code-quality-guard-config, ".code-quality-guard.mjs",
  "code quality guard config".
version: 0.1.0
---

# code-quality-guard-config

Manage the Git-root `.code-quality-guard.mjs` consumed by `code-quality-guard`. Read the sibling `DESIGN.md` before editing configuration.

## Workflow

1. Resolve the Git root and read the complete existing config.
2. Create only `.code-quality-guard.mjs` when no config exists.
3. Prefer changing one built-in check mode or adding a narrow ordered override.
4. Keep resource limits within the documented bounds.
5. Never add executable paths, argument templates, callbacks, shell commands, install steps, or network access.
6. Verify with the plugin's offline unit tests.

Minimal configuration:

```js
export default {
  checks: {},
  overrides: [],
};
```

Fixture override:

```js
export default {
  overrides: [
    {
      match: /^fixtures\//,
      checks: { eslint: "off", ruff: "off" },
    },
  ],
};
```

Valid modes are `block`, `report`, and `off`. The first matching override that declares a check wins for that check.
