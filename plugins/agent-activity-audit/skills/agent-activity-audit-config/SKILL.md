---
name: agent-activity-audit-config
description: Initialize or diagnose .agent-activity-audit.mjs for the agent-activity-audit trail plugin.
version: 0.2.0
---

# agent-activity-audit-config

Manage the project configuration consumed by `agent-activity-audit`.

Authoritative schema: sibling plugin `README.md`.

## Discovery

Git root, first existing file:

1. `.agent-activity-audit.mjs`
2. `.agent-activity-audit.cjs`
3. `.agent-activity-audit.js`

## Schema

```js
export default {
  enabled: true,
  auditRoot: ".agent-activity-audit",
  maxCommandChars: 2000,
  redactSecrets: true,
};
```

| Field | Type | Rule |
| --- | --- | --- |
| `enabled` | `boolean` | Default `true` |
| `auditRoot` | `string` | Relative path without `..` |
| `maxCommandChars` | `number` | `64..20000`; default `2000` |
| `redactSecrets` | `true` | Fixed safety invariant; `false` is rejected and redaction remains active |

## Workflow

1. Read existing config fully before editing.
2. Initialize only `.agent-activity-audit.mjs` when missing.
3. Do not commit unless asked.
