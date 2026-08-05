# php-runtime-guards host acceptance

Cases under `cases/` drive **real Claude Code and Codex** sessions (DeepSeek V4 Flash)
via `scripts/acceptance/run.sh`.

| Case | Behavior |
| --- | --- |
| 01-deny-repositories | see case.toml |

Run:

```bash
./scripts/acceptance/run.sh --plugin php-runtime-guards
```
