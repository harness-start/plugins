# goal-task-gate

Dual-host (Claude Code / Codex) plugin that audits host **`/goal`** long runs:

1. **Arm** when the user prompt starts with `/goal <objective>` (not status/pause/resume).
2. Inject a short protocol: log decisions under `.goal-task/runs/<run_id>/decisions.tsv` via `log-decision.mjs`.
3. **Protect** trail files — no generic Edit/Write; append or tip-rewrite last 2–3 rows only.
4. **Complete** only when the assistant ends with `GOAL_TASK_DONE …` **and** trail tip is `kind=close` with matching hash.
5. **Clear** on `/goal clear` (and Claude clear aliases); **supersede** when a new `/goal <other>` starts mid-run.

Does not block business code edits. Does not replace the host goal evaluator.

## Install

Via marketplace `harness-start` (root README) or local plugin path.

## Config

Optional project root (trusted `import()`):

- `.goal-task-gate.mjs` / `.cjs` / `.js`

See `skills/goal-task-gate-config/` and [DESIGN.md](./DESIGN.md).

## Skills

- `goal-task-audit-trail` — when/how to log and complete
- `goal-task-gate-config` — project config

## Tests

```bash
node --test plugins/goal-task-gate/tests/*.test.mjs
bash plugins/goal-task-gate/acceptance/cases/01-goal-prompt-arms-inject/run-fixture.sh
```

## Locate a run

```bash
cat .goal-task/CURRENT
column -s$'\t' -t .goal-task/runs/"$(cat .goal-task/CURRENT)"/decisions.tsv
```
