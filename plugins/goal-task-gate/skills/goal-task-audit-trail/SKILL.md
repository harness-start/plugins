---
name: goal-task-audit-trail
description: >
  Decision and work trail protocol for goal-task-gate while a host /goal run is
  armed. Append decisions via log-decision.mjs, optional work lines via
  log-work.mjs, tip rewrite last 2–3 rows only, complete with kind=close plus
  GOAL_TASK_DONE trailer. Triggers: /goal, goal-task-gate, decisions.tsv,
  GOAL_TASK_DONE, show-me-your-work style audit.
---

# goal-task-audit-trail

When `goal-task-gate` is **armed** (user started `/goal <prompt>`), keep a reviewable trail under `.goal-task/runs/<run_id>/`.

## Locate the run

1. Read `.goal-task/CURRENT` for `run_id`.
2. Decisions: `.goal-task/runs/<run_id>/decisions.tsv`
3. Work (optional): `.goal-task/runs/<run_id>/work.jsonl`
4. Meta: `.goal-task/runs/<run_id>/meta.json`

## Log a decision

```bash
node "${CLAUDE_PLUGIN_ROOT:-$PLUGIN_ROOT}/scripts/log-decision.mjs" \
  --workspace "$(git rev-parse --show-toplevel)" \
  --phase <phase> \
  --kind <open|plan|explore|implement|verify|pivot|revert|blocker|checkpoint|close> \
  --decision "<what>" \
  --why "<why in plain words>" \
  --evidence "<commit|path|receipt>" \
  --result <open|ok|fail|reverted|blocked|INCONCLUSIVE> \
  [--scope "path1;path2"]
```

### Tip rewrite (last 2–3 rows only)

```bash
node .../log-decision.mjs --workspace <root> --rewrite-tip 1 \
  --rows-json '[{"phase":"impl","kind":"verify","decision":"...","why":"...","evidence":"...","result":"ok"}]'
```

Older rows are **sealed**. To supersede a sealed decision, append a new row (`pivot` / `revert`) that references the old `seq` in `why` or `evidence`.

## Optional work line

```bash
node .../log-work.mjs --workspace <root> \
  --action edit --targets src/a.ts,src/b.ts --summary "wire handler" \
  [--decision-seq N]
```

## Complete (required)

1. Append `kind=close` with real evidence.
2. End the **final** assistant message with exactly:

```text
GOAL_TASK_DONE run_id=<run_id> status=completed close_seq=<n> tip_hash=<hash>
```

`close_seq` and `tip_hash` must match the close row (`log-decision` JSON output or last TSV row).

Do **not** emit `GOAL_TASK_DONE` mid-run.

## Rules

- One row = one decision/checkpoint (show-me-your-work style).
- Evidence is a pointer, not a paragraph.
- Never Edit/Write `decisions.tsv` or `work.jsonl` with generic file tools.
- New `/goal <other prompt>` supersedes the old run; old trail stays on disk.
- `/goal clear` disarms without requiring a trailer.

## Columns

See `references/decision-log-template.tsv`.
