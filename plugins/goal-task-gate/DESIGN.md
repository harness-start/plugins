# goal-task-gate design

## Responsibility

Arm when the user starts a host **`/goal <prompt>`**, force a **regular on-disk decision trail** under `.goal-task/`, protect that trail from generic rewrites (append + tip window only), and treat completion as **`GOAL_TASK_DONE` trailer ∩ `kind=close` trail tip** — not host-native goal status (hooks do not expose it reliably).

Does **not** replace host `/goal` continuation/evaluators. Does **not** block ordinary business writes.
Does **not** create or modify `.gitignore`.

## Host `/goal` and hooks (research)

| Host | Goal complete in hooks? | Entry signal used |
| --- | --- | --- |
| Claude Code | **No** — Stop has no goal fields; `/goal` is an internal prompt-based Stop shortcut | `UserPromptSubmit` text prefix `/goal …` |
| Codex | **No** public hook field for `thread_goals.status` | Same prompt prefix |
| Grok | Goal loop runs **before** Stop gate; no complete field | Protocol-compatible if prompt visible |

Completion detection: inject protocol requiring final-line trailer; Stop reads `last_assistant_message` and validates trail.

## Lifecycle

| User input | Plugin |
| --- | --- |
| `/goal <objective>` | arm (or supersede prior armed run) |
| `/goal clear` / stop / off / reset / none / cancel | clear + disarm |
| `/goal` bare, status, pause, resume | ignore |
| `# goal-task-abort` | abort + disarm |

States: `idle` ↔ `armed`. Disk run statuses: `armed` | `completed` | `cleared` | `superseded`.

## Trail pattern

```text
.goal-task/
  CURRENT
  runs/<run_id>/meta.json
  runs/<run_id>/decisions.tsv
  runs/<run_id>/work.jsonl
```

Decision columns (fixed):  
`seq ts phase kind decision why evidence result scope prev_hash row_hash run_id session_id`

**kinds:** open | plan | explore | implement | verify | pivot | revert | blocker | checkpoint | close

**Write rules:** append via `log-decision.mjs`; `--rewrite-tip k` for last `tipWindow` (2|3, default 3) rows; sealed prefix immutable (hash chain detects tamper).

## Completion trailer

```text
GOAL_TASK_DONE run_id=<id> status=completed close_seq=<n> tip_hash=<hash>
```

Must match tip row `kind=close`, seq, and `row_hash`. Fake trailer → Stop block (unless softOnly).

## Hooks

| Event | Role |
| --- | --- |
| UserPromptSubmit | arm / supersede / clear / inject protocol |
| PreToolUse | deny generic Edit/Write/shell mutation of decisions.tsv / work.jsonl |
| Stop | trailer + trail gate; sparse soft report |

Session state: `PLUGIN_DATA` / `CLAUDE_PLUGIN_DATA` under `goal-task-gate/`, keyed by SHA-256(`sessionId\0cwd`), TTL default 48h, fail-open.

## Phase 2 (reserved)

- Business path legality vs `scope` / `work.targets`
- Host `goal_status` if ever exposed
- Auto work lines on PostToolUse

## Non-goals

- Semantic quality of decisions
- True WORM / anti-human delete
- Mirroring pause/resume/status UI
- Invented slash aliases (`/goal-task`)
