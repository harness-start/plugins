# reasoning-discipline-guard acceptance

## Host cases

| Case | Intent | Expected outcome |
| --- | --- | --- |
| `01-no-file-no-activation` | Simple lookup | Skill and hooks do not create or bind a workflow |
| `02-exact-candy` | Exact strategy-variable problem | Five receipts, closed workflow, answer 21 |
| `03-causal-pauses-without-evidence` | Missing causal observations | Honest paused workflow without invented cause |
| `04-decision-sensitivity` | Consequential option comparison | Decision branch closes after sensitivity check |
| `05-premature-conclusion-blocked` | Deliberate stage jump | Hook reports `expected frame` and Stop blocks the premature conclusion |
| `06-tool-free-exact-candy` | Exact problem with an explicit no-tools constraint | No workflow or tool call; final response is exactly `21` |

All cases run on Claude and Codex. `expect.sh` requires real hook markers and checks workspace artifacts, not prompt echoes alone.

## Offline checks

The public hook seam and all three branch validators run without a live model:

```bash
node --test plugins/reasoning-discipline-guard/tests/reasoning-workflow.test.mjs
```
