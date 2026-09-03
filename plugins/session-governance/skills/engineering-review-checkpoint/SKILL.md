---
name: engineering-review-checkpoint
description: Coordinate one bounded read-only reviewer after a coherent high-risk implementation slice, or when the user explicitly requests an engineering review checkpoint or asks to summon an engineering critic. Use for cross-module, public-contract, security, persistence, migration, concurrency, data-integrity, deployment, runtime-state, recovery, or observability risk. Do not use for simple local edits or an initial read-only audit.
---

# Engineering Review Checkpoint

Use one independent reviewer to challenge the current implementation snapshot. The parent keeps implementation ownership, verifies every result, and decides what changes.

## When to run

Run after the first coherent implementation slice and its focused checks pass, before broad verification, commit, or delivery, when the change:

- crosses modules or changes a public API, CLI, schema, or configuration contract;
- affects authentication, authorization, security, untrusted input, concurrency, or data integrity;
- changes persistence, migrations, deployment, runtime state, recovery, rollback, or observability; or
- is explicitly submitted for a review checkpoint or an engineering critic.

Do not run for a simple local edit with a direct test oracle. Run no more than one reviewer per checkpoint.

## Select one profile

Use the first matching profile in this order:

1. **breaker** — authentication, authorization, security, untrusted input, concurrency, data integrity, or failure-path risk;
2. **operator** — migration, deployment, runtime state, recovery, rollback, or observability risk;
3. **maintainer** — public compatibility, cross-module coupling, evidence for newly introduced abstractions, unnecessary complexity, upgrade behavior, and all other qualifying changes.

These are professional review lenses, not imitations of real people. Require direct, neutral, evidence-backed language.

## Dispatch contract

Dispatch one generic host-native subagent. Keep it read-only. When the host can restrict tools, allow only repository reading and searching; otherwise state that the read-only boundary is instructional and verify afterward that no reviewer mutation occurred. The reviewer must not contact the user, delegate again, or make the final delivery decision.

Send only this bounded Task Brief:

```text
Objective:
Non-goals:
Profile: maintainer | breaker | operator
Allowed files:
Base and current subject:
Requirements:
Focused verification evidence:
Forbidden actions: edit files, run mutating commands, contact the user, delegate
Forbidden context: full conversation, private reasoning, unrelated files, prior reviewer conclusions
Output: NO_FINDINGS or at most three P0-P3 Result Cards
```

Do not send credentials, the full transcript, unrelated worktree state, another reviewer's conclusions, or a prose summary in place of the actual scoped diff or files.

Use an isolated child context when the host supports it; on Codex, set `fork_turns: "none"`. After dispatch, wait exactly once for at most 10 seconds (10,000 ms). Do not retry a failed dispatch, send status messages, or enter another wait. If the reviewer has not returned a complete Result Card, interrupt it once when the host supports interruption, treat it as unavailable, and immediately use the parent fallback below. Verify the worktree after the child stops; any reviewer mutation invalidates the independent result and requires recovery plus parent fallback.

## Reviewer Result Card

The reviewer returns exactly `NO_FINDINGS` when no material defect survives verification. Otherwise it returns no more than three findings ordered from P0 to P3:

```text
[P1] Short defect title — path/to/file.ext:line
Evidence: concrete input, event sequence, or violated contract.
Impact: caller-visible failure and affected scope.
Fix or recovery: specific change or rollback path.
Verification: command or scenario that would prove recovery.
Assumptions:
Gaps:
```

Every finding needs an exact `file:line` anchor, concrete evidence, impact, and a verifiable fix or recovery path. Style preferences, praise, quotas, and speculative risks are not findings.

## Parent disposition

Reopen every referenced location and independently check the claimed input, event sequence, or contract. Accept, reject, or repair each finding based on current evidence; do not change correct code merely because the reviewer was asked to criticize it. After any repair, rerun focused checks and treat the previous review as stale for the changed area.

If subagents are unavailable, disabled, fail to return inside the single wait, or violate the read-only boundary, perform the same selected-profile review in the parent and state: `Independent review was not performed; parent fallback review completed.` Do not fabricate a child identity or call the fallback independent.

## Honest limits

This workflow can prove only that a bounded review was requested and reconciled. It cannot prove that the reviewer found every defect. A subagent call, Skill load, structured Result Card, or extra model turn is not outcome evidence; task tests and external observations remain authoritative.
