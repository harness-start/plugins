# markdown-format-guard host acceptance

Cases under `cases/` run real Claude Code and Codex sessions through `scripts/acceptance/run.sh`. Live runs are Docker-only.

| Case | Behavior |
| --- | --- |
| `01-fix-heading-jump` | Writes a Markdown file with a jumped heading level, observes the guard, and repairs it |

Run from the repository root:

```bash
./scripts/acceptance/run.sh --plugin markdown-format-guard
```

Honesty only, without Docker or API access:

```bash
./scripts/acceptance/run.sh --honesty-only
```

See [host acceptance documentation](../../../docs/host-acceptance.md).
