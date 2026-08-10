---
name: source-sanity-guard-config
description: Change source-sanity-guard modes and path overrides for backup artifacts and garbled text in .source-sanity-guard.mjs.
version: 0.2.0
---

# source-sanity-guard-config

Manage the Git-root `.source-sanity-guard.mjs` consumed by `source-sanity-guard`. Read `../../README.md` before changing configuration.

## Workflow

1. Resolve the root with `git rev-parse --show-toplevel` and read the existing config in full.
2. Create only `.source-sanity-guard.mjs` when no config exists.
3. Keep broad defaults in `checks`; use ordered, narrow `RegExp` overrides for exceptions.
4. Use only `block`, `report`, or `off`. Do not add commands, callbacks, glob strings, or replacement logic.
5. Run the plugin unit tests after changing schema-sensitive configuration.

Minimal configuration:

```js
export default {
  checks: {},
  overrides: [],
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

The first matching override that declares a check wins for that check. Keep exceptions narrower than built-in skipped directories. Configure merge conflict detection through `git-delivery-guards`, not this plugin.
