---
name: goal-task-gate-config
description: >
  Manage project .goal-task-gate.mjs configuration for goal-task-gate: tipWindow,
  auditRoot, stopGate mode, TTL. Triggers: /goal-task-gate-config, goal-task-gate
  config, .goal-task-gate.mjs.
---

# goal-task-gate-config

Optional Git-root config (trusted `import()`), first match:

1. `.goal-task-gate.mjs`
2. `.goal-task-gate.cjs`
3. `.goal-task-gate.js`

Schema summary (defaults in parentheses):

| Field | Default | Notes |
| --- | --- | --- |
| `auditRoot` | `.goal-task` | Trail directory under repo root |
| `tipWindow` | `3` | Only `2` or `3` — tip rows rewritable via helper |
| `minRows` | `2` | Minimum decisions for completion |
| `sessionTtlHours` | `48` | Armed state TTL |
| `softOnly` | `false` | If true, Stop never hard-blocks |
| `stopGate.mode` | `block` | `block` \| `report` \| `off` |
| `stopGate.softSparseWhileArmed` | `true` | Soft warn when trail sparse |
| `gitignoreEnsure` | `true` | Ensure `.goal-task/` in `.gitignore` |
| `abortToken` | `# goal-task-abort` | Engineering abort |

See `references/example-config.mjs` and plugin `DESIGN.md`.
