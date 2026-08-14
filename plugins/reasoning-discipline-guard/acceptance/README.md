# reasoning-discipline-guard acceptance

## Host cases

| Case | Intent | Expected outcome |
| --- | --- | --- |
| `01-no-file-no-activation` | Simple lookup | Skill and hooks do not create or bind a workflow |
| `02-exact-candy` | Exact strategy-variable problem | Five receipts, closed workflow, answer 21 |
| `03-causal-pauses-without-evidence` | Missing causal observations | Honest paused workflow without invented cause |
| `04-decision-sensitivity` | Consequential option comparison | Decision branch closes after sensitivity check |
| `05-premature-conclusion-blocked` | Deliberate stage jump | Hook reports `expected frame` and Stop blocks the premature conclusion |
| `06-auto-routed-exact-candy` | Exact problem without an explicit Skill name | Session route activates a closed exact workflow and returns `21` |
| `07-explicit-shape-choice` | Explicit selectable-category reading | Allocation model closes with the selectable-shape result |
| `08-explicit-blind-draw` | Explicitly prohibited category selection | Blocked-observability model closes with the blind-draw result |
| `09-semantic-policy-support` | Semantic policy choice with a numeric supporting metric | Supporting score remains evidence and does not replace the policy identifier |
| `11-zh-cn-artifact-language` | Chinese evidence-starved causal workflow | Manifest and frame prose follow Chinese, then pause honestly before unsupported analysis |

All cases run on Claude and Codex. `expect.sh` requires real hook markers and checks workspace artifacts, not prompt echoes alone.

## Offline checks

The public hook seam and all three branch validators run without a live model:

```bash
node --test plugins/reasoning-discipline-guard/tests/reasoning-workflow.test.mjs
```
