# symfony-runtime-guards host acceptance

Cases under `cases/` drive **real Claude Code and Codex** sessions (DeepSeek V4 Flash)
via `scripts/acceptance/run.sh`.

| Case | Behavior |
| --- | --- |
| 01-deny-var-cache | see case.toml |

Run:

```bash
./scripts/acceptance/run.sh --plugin symfony-runtime-guards
```
