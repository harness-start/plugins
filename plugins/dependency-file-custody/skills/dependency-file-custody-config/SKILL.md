---
name: dependency-file-custody-config
description: Change dependency-file-custody protected path patterns and allow exceptions in .dependency-file-custody.mjs.
version: 0.2.0
---

# dependency-file-custody-config

Manage the project configuration consumed by the `dependency-file-custody` PreToolUse hook.

The authoritative schema is in the plugin sibling `README.md`. Read it before changing configuration.

## Config discovery

Resolve the project root with `git rev-parse --show-toplevel`. Load the first existing file only:

1. `.dependency-file-custody.mjs`
2. `.dependency-file-custody.cjs`
3. `.dependency-file-custody.js`

Do not create a second config when one already exists. Non-Git directories use built-ins only.

## Schema

```js
export default {
  rules: [
    {
      id: "protect-generated-sdk",
      match: /^src\/generated-sdk\//,
      mode: "block",
      reason: "The SDK is maintained by a generator",
      recovery: "Change the generator source and regenerate the SDK",
    },
    {
      id: "allow-reviewed-vendor-patch",
      match: /^vendor\/acme\/patched\//,
      mode: "allow",
    },
  ],
};
```

| Field | Type | Rule |
| --- | --- | --- |
| `match` | `RegExp` | Required; matches repo-relative POSIX paths |
| `mode` | `"block" \| "allow"` | Optional; defaults to `block` |
| `id` | `string` | Optional stable identifier |
| `reason` | `string` | Optional block explanation |
| `recovery` | `string` | Optional concrete recovery path |

User rules precede built-ins and first match wins.

## Workflow

1. Locate and read the full existing config.
2. For initialization, create only `.dependency-file-custody.mjs` with an empty `rules` array; do not copy built-ins.
3. Add specific rules before broader rules.
4. Use `allow` only for a narrow, project-owned exception that the user has requested.
5. Diagnose invalid regex types, modes, optional field types, and shadowed rules.
6. Report the config path and exact rules changed; do not commit unless asked.

Minimal initialization template:

```js
// User rules run before dependency-file-custody built-ins; first match wins.
export default {
  rules: [],
};
```

## Anti-patterns

- Copying every built-in rule into project configuration.
- Using string patterns instead of RegExp literals.
- Adding `allow` for `/.*/`, the repository root, all `vendor/`, or all `node_modules/`.
- Adding unsupported `report`, glob, settings, or replacement semantics.
- Treating package-manager commands such as `pnpm install` as dependency-file-custody inputs; the hook only inspects explicit write paths.
