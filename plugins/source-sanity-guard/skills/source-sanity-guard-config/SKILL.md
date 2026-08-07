---
name: source-sanity-guard-config
description: >
  Initialize, inspect, edit, and diagnose .source-sanity-guard.mjs. Use when a
  user wants to change source-sanity check modes, add a narrow path override,
  or diagnose backup artifact or garbled text guard behavior.
  Triggers: /source-sanity-guard-config, ".source-sanity-guard.mjs",
  "source sanity config", "源码卫生配置".
version: 0.2.0
---

# source-sanity-guard-config

Manage the Git-root `.source-sanity-guard.mjs` consumed by `source-sanity-guard`. Read `../../DESIGN.md` before changing configuration.

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
