# execution-loop-guard host acceptance

Cases under `cases/` run real Claude Code and Codex sessions through the shared Docker-only acceptance runner.

| Case | Behavior |
| --- | --- |
| `01-block-edit-loop` | Lowers the fixture threshold, requires three separate edits to trigger the PostToolUse loop block, and verifies the project-local state layout. |

```bash
./scripts/acceptance/run.sh --plugin execution-loop-guard
```
