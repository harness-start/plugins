---
name: engineering-quality-config
description: "Change or diagnose shared line-budget and Markdown quality settings in .engineering-quality.mjs. Use for file-size ratchets, Markdown checks, or narrow path exceptions; language checks belong to domain plugins."
disable-model-invocation: true
version: 0.2.0
---

# engineering-quality-config

Manage the Git-root `.engineering-quality.mjs` consumed by `engineering-quality`. Read the sibling `README.md` before editing configuration.

## Workflow

1. Resolve the Git root and read the complete existing config.
2. Create only `.engineering-quality.mjs` when no config exists.
3. Use `rules` and `settings` only for language-neutral file line budgets.
4. Use `checks` and `overrides` only for Markdown structure.
5. Keep exceptions narrow and ordered; preserve unrelated project settings.
6. Never add language syntax, formatter, linter, dependency-file, executable-path, shell-command, install, or network settings here. Route those needs to the corresponding domain plugin.
7. Verify with the plugin's offline unit tests.

Minimal configuration:

```js
export default {
  rules: [],
  checks: {},
  overrides: [],
};
```

Example:

```js
export default {
  rules: [
    { match: /^src\/generated\//, mode: "skip" },
    { match: /^src\/legacy\//, budget: 900, mode: "report" },
  ],
  checks: { fencedCodeLanguage: "report" },
  overrides: [
    {
      match: /^fixtures\//,
      checks: { trailingWhitespace: "off" },
    },
  ],
};
```

Line-budget modes are `block`, `report`, and `skip`; Markdown modes are `block`, `report`, and `off`.
