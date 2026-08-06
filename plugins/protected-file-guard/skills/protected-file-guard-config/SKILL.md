---
name: protected-file-guard-config
description: >
  Initialize, inspect, edit, and diagnose the project-root
  .protected-file-guard.mjs (or .cjs/.js) config used by the
  protected-file-guard plugin. Use when the user wants to protect additional
  file patterns, add a narrow allow exception, fix an invalid protected-file
  rule, or asks about protected-file-guard configuration / 受保护文件配置.
  Triggers: /protected-file-guard-config, ".protected-file-guard.mjs",
  "protected file config", "受保护文件配置".
version: 0.1.0
---

# protected-file-guard-config

Manage the project configuration consumed by the `protected-file-guard` PreToolUse hook.

The authoritative schema is the plugin sibling `DESIGN.md`. Read it before changing configuration.

## Config discovery

Resolve the project root with `git rev-parse --show-toplevel`. Load the first existing file only:

1. `.protected-file-guard.mjs`
2. `.protected-file-guard.cjs`
3. `.protected-file-guard.js`

Do not create a second config when one already exists. Non-Git directories use built-ins only.

## Schema

```js
export default {
  rules: [
    {
      id: "protect-generated-sdk",
      match: /^src\/generated-sdk\//,
      mode: "block",
      reason: "SDK 由生成器维护",
      recovery: "修改生成源并重新生成 SDK",
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
2. For initialization, create only `.protected-file-guard.mjs` with an empty `rules` array; do not copy built-ins.
3. Add specific rules before broader rules.
4. Use `allow` only for a narrow, project-owned exception that the user has requested.
5. Diagnose invalid regex types, modes, optional field types, and shadowed rules.
6. Report the config path and exact rules changed; do not commit unless asked.

Minimal initialization template:

```js
// User rules run before protected-file-guard built-ins; first match wins.
export default {
  rules: [],
};
```

## Anti-patterns

- Copying every built-in rule into project configuration.
- Using string patterns instead of RegExp literals.
- Adding `allow` for `/.*/`, the repository root, all `vendor/`, or all `node_modules/`.
- Adding unsupported `report`, glob, settings, or replacement semantics.
- Treating Shell commands as protected-file-guard inputs; v1 intentionally covers file tools only.
