# php-runtime-guards host acceptance

Cases under `cases/` drive **real Claude Code and Codex** sessions (DeepSeek V4 Flash)
via `scripts/acceptance/run.sh`. **Live runs are Docker-only** (auto-wrapped on the host).

| Case | Behavior |
| --- | --- |
| 01-deny-repositories | see case.toml |

Run (from repo root; requires Docker + `.env` DeepSeek key):

```bash
./scripts/acceptance/run.sh --plugin php-runtime-guards
```

Honesty only (no Docker / no API):

```bash
./scripts/acceptance/run.sh --honesty-only
```

See [docs/host-acceptance.md](../../../docs/host-acceptance.md).
