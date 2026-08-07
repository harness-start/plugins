# first-principles-gate design

## Responsibility

Open a short-lived first-principles session from an **explicit user entry token**, inject a process protocol, **block non-ledger business mutations** while open, and require a **machine-checkable on-disk ledger** when the session completes or the assistant claims completion.

The plugin does **not** judge whether atoms are truly irreducible, whether reasoning quality is good, or whether conclusions are optimal.

## Session model

Phases: `idle` → `open` → `closed` (or back to `idle` on TTL).

| Event | Behavior |
| --- | --- |
| UserPromptSubmit entry | Match prompt **prefix** tokens → `open`, inject protocol |
| UserPromptSubmit open | `done` → `closed(completed)`; `# first-principles-abort` → `closed(aborted)`; other text → continue inject |
| PreToolUse | While `open` and `writeBlock.mode=block`, deny non-allowlisted file/shell mutations |
| PostToolUse | Optional ledger revision bookkeeping when allowlisted paths change |
| Stop | Soft-report incomplete ledger while open; **block** on completion claim or `closed(completed)` without valid ledger; block implement claims while open |

State is stored under the host plugin-data directory, keyed by SHA-256 of `sessionId\0cwd`, TTL default 24h. Corrupt / missing state **fail-open** to `idle` (no permanent write lock).

## Entry tokens (default)

- `/first-principles`
- `$first-principles`

Short aliases such as `/fp` or `$fp` are **not** entry tokens. Mid-string mentions do not open the mode.

Close: whole-line / prefix `done`. Abort: `# first-principles-abort`.

## Ledger schema (`first-principles/v1`)

Primary path: `.first-principles/ledger.json` (JSON object). Markdown files under `.first-principles/` may embed a fenced `first-principles` JSON block. Configured `ledger.primaryRelativePath` is auto-allowlisted for writes (file + parent directory).

Required structural fields:

- `schema`: `"first-principles/v1"`
- `question` or `problem` (non-empty string)
- `assumptions[]` with `id` + `claim`
- `atoms[]` with `id` + `statement`
- `rebuild.options[]` (or `rebuild` as array) with `id`, `conclusion`, non-empty `derived_from` atom ids
- `uncertainties[]` non-empty strings

Optional: `status`, `default_practice`, atom `kind`/`source`, option `rejects`.

Hard checks are structural and reference-integrity only.

### Session binding (anti-stale)

A ledger that is only structurally valid is **not** enough for completion. Stop also requires the ledger to be bound to the active open session via either:

1. file `mtime` at or after `state.enteredAt`, or
2. an observed in-session **ledger artifact file** write (`ledgerRevision > 0` via PostToolUse on `.json`/`.md` allowlisted paths — not bare `mkdir` of the parent directory).

Stale ledgers from earlier analyses fail with an explicit finding.

### Shell write barrier

While open, shell mutations are path-aware: allowlisted ledger targets pass; business targets deny; mutating commands without resolvable targets fail closed. Paths are `..`-normalized before allowlist checks.

## Write allowlist (default)

- `.first-principles/**`
- `docs/decisions/**`
- `**/spec.md` when `allowSpecMd` is true

## Configuration

Trusted executable config at Git root (optional):

- `.first-principles-gate.mjs` / `.cjs` / `.js`

Unsupported values fall back to defaults for that field (or full defaults when load fails).

## Recovery

- User: `done` unlocks writes; `# first-principles-abort` aborts.
- Agent: write a valid ledger; Stop block reasons list missing fields.
- After two consecutive ledger Stop blocks, fail-open with an explicit warning to avoid deadlock.

## Non-goals

- Semantic quality of first-principles thinking
- Replacing the global `first-principles-thinking` skill outside this plugin’s bundled ledger skill
- Grill-me multi-choice interview UX
- Language governance, test/CI provenance, or subagent hygiene
