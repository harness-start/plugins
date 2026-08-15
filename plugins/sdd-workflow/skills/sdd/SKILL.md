---
name: sdd
description: Guide a repository change through the lightweight spec, plan, tasks, build, and verification workflow. Use when the user invokes $sdd, asks for spec-driven development, wants to continue an existing .specs change, or needs an implementation recovered from durable SDD artifacts.
---

# SDD

Keep one durable change at `.specs/<NNN>-<slug>/`. The user only needs `$sdd`; route internally to `$sdd-specify`, `$sdd-plan`, `$sdd-tasks`, then `$sdd-build`.

## Find the next step

1. Read project instructions and inspect `.specs/` without rewriting valid artifacts.
2. Select the explicitly named change. If none is named, continue the only incomplete change; otherwise create the next numeric directory.
3. Validate the directory with the bundled `scripts/sdd-workflow-validate.mjs`.
4. Choose exactly one next action:
   - missing or invalid `spec.md` → specify;
   - missing, invalid, or stale `plan.md` → plan;
   - missing, invalid, or stale `tasks.md` → tasks;
   - valid chain → build.
5. Flow continuously unless project safety rules or a material product decision require the user.

The hook only protects artifact order and digest freshness. It does not block source writes, judge semantic quality, prove that implementation follows the artifacts, or turn a `Verify:` recipe into test evidence.

## Context-hygiene protocol

Keep the parent context authoritative for the user goal, active change path, current artifact hashes, decisions, Git state, final verification, and delivery. Delegate only bounded evidence gathering or task-local implementation.

- Use Codex `fork_turns: "none"` or the host's ordinary isolated-subagent equivalent.
- Set maximum concurrency to 2 and allow no nested delegation.
- Do not spawn for a simple single-file, single-task change.
- Use the single-agent fallback when subagents are unavailable or isolation cannot be verified.
- Give each worker a Task Brief containing Change/Task ID, artifact hashes, goal, non-goals, allowed files, forbidden actions, Verify command, expected evidence, and failure exit.
- Give every Task Brief a parent-generated `brief-id` and require the Result Card to echo it exactly. This is a necessary correlation marker, not proof that the host delivered the brief; a worker could recover it from shared ambient data.
- Time-box the initial delivery handshake to one short host wait. A worker that cannot acknowledge its `brief-id` promptly is unavailable; do not leave the parent blocked behind it.
- Require a Result Card of at most 4 KiB containing conclusion, files inspected or changed, commands and results, evidence anchors, assumptions/gaps, and parent action. Never request private token-by-token reasoning or full logs.
- Keep workers out of `.specs/**`, Git history, branches, MRs, and delivery. Permit only the files declared for their role.
- Re-read decisive evidence, inspect the diff, and have the parent rerun every task's `Verify` command before accepting completion.
- Allow one worker revision. On a second failure, narrow the task or take it back into the parent.
- Reject results with a missing or wrong `brief-id`, unexpected descendants, forbidden tool use, undeclared writes, or unverifiable scope. Interrupt that lane when possible and continue in the parent; never reconstruct a worker's task from ambient logs or accept an inferred answer.

Use subagents as a context-isolation mechanism, not as evidence of higher quality. Report only observed outcomes from actual validation.
`fork_turns: "none"` requests reduced inherited conversation; it does not prove that the worker honored the Task Brief. It is also not a filesystem sandbox and cannot prove what a worker read. Treat the `brief-id` echo only as correlation, allowed-file rules as behavioral scope, verify writes through the parent diff, and never place secrets in a shared workspace merely because workers are scoped. On a host/model combination that fails the bounded-worker acceptance—including the Codex 0.147 plus DeepSeek combination exercised by this plugin—do not delegate with `fork_turns: "all"`; use the parent fallback until transcript-level acceptance proves direct delivery before action, no forbidden worker calls, no descendants, and an exact Result Card.
