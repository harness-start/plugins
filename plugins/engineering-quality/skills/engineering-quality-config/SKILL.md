---
name: engineering-quality-config
description: "Change or diagnose project engineering-quality settings: syntax/lint modes, path exceptions, and bounded ESLint/Ruff/PHPStan/Composer limits in .engineering-quality.mjs."
version: 0.1.0
---

# engineering-quality-config

Manage the Git-root `.engineering-quality.mjs` consumed by `engineering-quality`. Read the sibling `README.md` before editing configuration.

## Workflow

1. Resolve the Git root and read the complete existing config.
2. Create only `.engineering-quality.mjs` when no config exists.
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
