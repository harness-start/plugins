---
name: sdd-build
description: Implement a valid .specs change task by task, using bounded fresh subagents when useful and parent-owned verification. Use when spec.md, plan.md, and tasks.md are valid and current, or when resuming remaining tasks from those artifacts.
---

# SDD Build

Validate the artifact chain before touching implementation. Read task order from the DAG; do not recreate valid artifacts when resuming. Existing repository evidence determines what is already complete—unchecked prose alone does not.

## Dispatch policy

- Keep a single-file, single-task change in the parent. Do not spawn an implementer for it; if an independent reviewer is later required, that reviewer must be the only subagent for the change.
- With two or more tasks, prefer one fresh implementer per task so old implementation detail does not accumulate in the parent.
- Run sequentially by default. Permit at most two concurrent workers only when dependencies are satisfied and declared Files are disjoint.
- Use Codex `fork_turns: "none"` or the host's isolated equivalent, maximum concurrency 2, and no nested delegation.
- Use the single-agent fallback if workers are unavailable or their scope cannot be isolated.

Each Task Brief must include a parent-generated `brief-id`, the change path, Task ID, current spec/plan/tasks hashes, requirement goal, non-goals, allowed Files, forbidden `.specs/**` and Git/delivery actions, exact Verify command, evidence required, and failure exit. An implementer may edit only its declared source/test Files.

Require a Result Card no larger than 4 KiB that echoes the exact `brief-id` and reports conclusion, changed files, commands/results, evidence anchors, assumptions/gaps, and parent action. The echo is a correlation marker, not proof of direct delivery. Reject raw transcripts, giant diffs, private reasoning, undeclared file edits, unexpected descendants, forbidden tool use, wrong or missing brief ids, and claims unsupported by receipts. A successful spawn call alone does not prove Task Brief delivery.

When a Task Brief declares an exact accepted Result Card, compare the direct worker receipt byte-for-byte before accepting it. Do not use substring matching, extract a card from surrounding prose, repair labels or case, normalize whitespace, or trust the parent's recollection of the response. Any prefix, suffix, blank line, duplicate card, or changed character makes the worker result invalid and triggers the declared failure path.

Use one short, explicit host wait for the first Result Card. If the `brief-id` handshake does not arrive in that window, interrupt the lane when possible and use the single-agent fallback; do not extend the wait repeatedly.

## Accept and verify

After every task, have the parent inspect the actual diff, re-read decisive files, and rerun that task's `Verify` command. Do not accept a worker's reported pass as a substitute. If the delivery handshake or worker scope cannot be verified, interrupt the lane when possible, discard its answer, and take the task back into the parent. Allow one scoped revision only for an otherwise valid lane; after a second implementation failure, narrow or take over the task.

For cross-module, public API, schema, security, or migration work, add an independent read-only reviewer after implementation. The parent owns final project checks, requirement-to-behavior review, Git state, delivery, and the user-facing evidence report. State explicitly when a conclusion is inferred rather than locally or remotely measured.
