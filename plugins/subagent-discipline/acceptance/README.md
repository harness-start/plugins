# subagent-discipline host acceptance

`cases/` starts real Claude Code and Codex sessions in the repository's Docker
acceptance environment.

| Case | Behavior |
| --- | --- |
| `01-subagent-contract` | A spawned read-only subagent receives and reports the injected contract marker |

From the repository root:

```bash
./scripts/acceptance/run.sh --plugin subagent-discipline
```

Run only the inert-log honesty gate:

```bash
./scripts/acceptance/run.sh --honesty-only
```
