---
name: file-access-audit-config
description: Initialize or diagnose .file-access-audit.mjs for the file-access-audit trail plugin.
version: 0.1.0
---

# file-access-audit-config

Manage the project configuration consumed by `file-access-audit`.

Authoritative schema: sibling plugin `DESIGN.md`.

## Discovery

Git root, first existing file:

1. `.file-access-audit.mjs`
2. `.file-access-audit.cjs`
3. `.file-access-audit.js`

## Schema

```js
export default {
  enabled: true,
  auditRoot: ".file-access-audit",
  gitignoreEnsure: true,
};
```

| Field | Type | Rule |
| --- | --- | --- |
| `enabled` | `boolean` | Optional; default `true` |
| `auditRoot` | `string` | Relative path without `..`; default `.file-access-audit` |
| `gitignoreEnsure` | `boolean` | Optional; default `true` |

## Workflow

1. Read existing config fully before editing.
2. Initialize only `.file-access-audit.mjs` when missing.
3. Do not commit unless asked.
