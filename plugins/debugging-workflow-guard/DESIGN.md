# Design

## Decision

Use an on-disk Debug Work Order as the activation capability. Do not infer debugging intent inside UserPromptSubmit and do not equate Skill loading with workflow entry.

## Invariants

1. Hooks are inert until a valid work-order mutation binds the current session; paused creation records entry without leaving an active guard.
2. Exactly one bug is active; all receipts carry that bug id.
3. Before production mutation, the active bug and every bug named by a shared fix must each have an attributed, exact, pre-mutation failing reproduction. The active bug must also have a current-session supported hypothesis and root cause and be in `fixing` / `in-progress`.
4. A resolved bug must have an applied fix mutation, an observed pre-mutation failure, supported hypothesis/root cause, a successful original reproduction after its last relevant mutation, regression success, and a non-failing cleanup receipt. `Stop` independently scans for its work-order marker.
5. Receipt references must exist in the bound session and belong to the same bug.
6. Three failed post-mutation reproductions freeze only the current bug.
7. SessionStart discovery never selects or resumes a work order.

## Hook topology

- `SessionStart` performs bounded discovery only. It neither classifies the prompt nor binds a work order.
- `PostToolUse` is the sole activation seam: a successful mutation of one valid work-order file binds its stable id and epoch to the current host session.
- `PreToolUse` blocks production mutation when the bound ledger is invalid, the exact failing baseline or supported causal evidence is absent, a shared affected bug lacks its own baseline, the active bug is ineligible, or three post-mutation reproductions have failed. It still permits repairing the exact invalid bound work-order path.
- `PostToolUse` / Claude `PostToolUseFailure` persist bounded receipts. Standard hosts receive structured `additionalContext`; the Codex 0.146 + DeepSeek compatibility path emits stderr and exits the post hook with status 2 so the host preserves the tool result while surfacing a hook signal.
- `Stop` always requires the response to reference the bound work order. For `closed` orders it resolves completion claims against current-session receipts and independently scans the repository for the work-order debug marker. For `paused` or `aborted` orders it accepts a schema-valid handoff without pretending unresolved bugs are complete.

`status`, `run.state`, bug status, hypothesis status, root-cause status, and fix status are distinct state machines. The Skill publishes their complete vocabularies; schema errors repeat the accepted values instead of requiring agents to inspect implementation code.

## Inspiration

The workflow combines four external ideas without installing or routing to external Skills. Research was pinned to these source revisions:

- `obra/superpowers/systematic-debugging` at `44c9b2d6e889982ac18c27d05a19fefe335194e1`: root cause before fixes and architectural escalation after repeated failures.
- `anthropics/knowledge-work-plugins/debug` at `28153f89ef0dcc754d0707a1d02ce0bf8213b9cc`: compact reproduce/isolate/diagnose/fix reporting loop.
- `wshobson/agents/debugging-strategies` at `c4b82b0ad771190355eb8e204b1329732a18449a`: differential, binary-search, and trace-based isolation strategies.
- `pproenca/dot-skills/debug` at `c9228d2d0c1391190168845824ceb4e33bb844fb`: locate WHERE behavior diverges before naming WHAT is broken; use last-known-good and fault propagation.

The local `/srv/workspaces/work/infra/harness-starter` implementation contributed tight RED loops, reset samples, unique debug prefixes, causal-chain recording, exact-reproduction verification, bounded state, and dual-host provenance conventions.

## Threat model

- A forged work-order receipt is rejected because Stop resolves IDs against plugin-data state.
- Cross-bug evidence is rejected by bug attribution.
- Stale verification is rejected when the reproduction predates the last mutation relevant to that bug or its shared-fix owner.
- Concurrent resumes are rejected by a work-order lease and epoch watermark.
- Invalid, oversized, symlinked, multi-block, or unknown-field work orders fail closed while bound. A failed initial write that leaves no file remains inert; a transiently invalid bound file preserves receipts and can only be repaired in place without changing id or epoch.

This is a process guard, not a theorem prover: successful commands and well-formed ledgers are necessary but not sufficient evidence that the real-world defect is fixed.
