# encoding-guard host acceptance

Cases under `cases/` run real Claude Code and Codex sessions through `scripts/acceptance/run.sh`. Live runs are Docker-only.

| Case | Behavior |
| --- | --- |
| `01-repair-utf8-bom` | Writes a UTF-8 BOM file, observes the guard, and repairs it to BOM-free UTF-8 |

Run from the repository root:

```bash
./scripts/acceptance/run.sh --plugin encoding-guard
```

Honesty only, without Docker or API access:

```bash
./scripts/acceptance/run.sh --honesty-only
```

See [host acceptance documentation](../../../docs/host-acceptance.md).
