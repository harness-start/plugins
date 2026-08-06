# execution-loop-guard host acceptance

Cases under `cases/` run real Claude Code and Codex sessions through the shared Docker-only acceptance runner.

| Case | Behavior |
| --- | --- |
| `01-block-edit-loop` | Lowers the fixture threshold and requires three separate edits to trigger the PostToolUse loop block. |

```bash
./scripts/acceptance/run.sh --plugin execution-loop-guard
```
