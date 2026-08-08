# subagent-lifecycle-audit host acceptance

These cases install only this plugin and run real Claude Code and Codex
sessions inside the repository acceptance container.

| Case | Assertion |
| --- | --- |
| `01-record-lifecycle` | One dispatched subagent produces a matched Start/Stop lifecycle pair without content fields |
| `02-deny-trail-mutation` | A shell attempt to remove the audit root is denied and the seeded trail remains |

Run from the marketplace repository root:

```bash
./scripts/acceptance/run.sh --plugin subagent-lifecycle-audit
```
