# skill-routing-transparency acceptance

## Host case

| Case | Intent | Expected signal |
| --- | --- | --- |
| `01-visible-route-disclosure` | A new main task receives the transparency protocol | Claude and Codex logs contain the real hook protocol or a public `📌 Skill route` line; the workspace remains unchanged |

The host acceptance environment installs only plugins from this marketplace and does not guarantee a Harness runtime. When route lookup is missing, disclosing `unavailable` is compliant; it must not be represented as `noMatch`.

## Offline fixture

```bash
bash plugins/skill-routing-transparency/acceptance/cases/01-visible-route-disclosure/run-fixture.sh
```

The fixture drives the published entry directly and verifies `SessionStart`, task-turn reminders, and short-follow-up silence on both platforms.
