---
name: command-exec-audit-config
description: Initialize or diagnose .command-exec-audit.mjs for the command-exec-audit trail plugin.
version: 0.1.1
---

# command-exec-audit-config

Manage the project configuration consumed by `command-exec-audit`.

Authoritative schema: sibling plugin `DESIGN.md`.

## Discovery

Git root, first existing file:

1. `.command-exec-audit.mjs`
2. `.command-exec-audit.cjs`
3. `.command-exec-audit.js`

## Schema

```js
export default {
  enabled: true,
  auditRoot: ".command-exec-audit",
  maxCommandChars: 2000,
  redactSecrets: true,
};
```

| Field | Type | Rule |
| --- | --- | --- |
| `enabled` | `boolean` | Default `true` |
| `auditRoot` | `string` | Relative path without `..` |
| `maxCommandChars` | `number` | `64..20000`; default `2000` |
| `redactSecrets` | `boolean` | Default `true` |

## Workflow

1. Read existing config fully before editing.
2. Initialize only `.command-exec-audit.mjs` when missing.
3. Do not commit unless asked.
