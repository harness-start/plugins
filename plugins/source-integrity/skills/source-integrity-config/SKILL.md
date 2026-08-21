---
name: source-integrity-config
description: Change source-integrity modes and path overrides for backup artifacts, garbled text, BOMs, and invalid UTF-8 in .source-integrity.mjs.
version: 0.3.0
---

# source-integrity-config

Manage the Git-root `.source-integrity.mjs` consumed by `source-integrity`. Read `../../README.md` before changing configuration.

## Workflow

1. Resolve the root with `git rev-parse --show-toplevel` and read the existing config in full.
2. Create only `.source-integrity.mjs` when no config exists.
3. Keep broad defaults in `checks`; use ordered, narrow `RegExp` overrides for exceptions.
4. Use only `block`, `report`, or `off` under `checks` and `overrides`. Encoding `rules` accept only `block` or `skip`, use `RegExp` matches, and apply before built-ins in declaration order.
5. Do not add commands, callbacks, glob strings, or replacement logic.
6. Run the plugin unit tests after changing schema-sensitive configuration.

Minimal configuration:

```js
export default {
  checks: {},
  overrides: [],
  rules: [],
};
```

Override example:

```js
export default {
  overrides: [
    {
      match: /^fixtures\/legacy\//,
      checks: { garbledText: "off" },
    },
  ],
};
```

The first matching override that declares a check wins for that check. Keep exceptions narrower than built-in skipped directories. Merge conflict detection is outside this plugin's responsibility. Shell commands without an explicit write path are not source-integrity inputs.

Encoding exception example:

```js
export default {
  rules: [
    { match: /^fixtures\/legacy\//, mode: "skip" },
  ],
};
```

Encoding rules apply only during `PostToolUse`; the first matching user or built-in rule wins. A `skip` exception disables BOM and strict UTF-8 validation for that path, so require an explicit legacy-fixture reason and keep the expression narrow.
