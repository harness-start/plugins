---
name: ci-gated-mr-workflow
description: Use when a code or configuration change must be delivered through a short-lived branch, remote review, required CI, merge, and post-merge verification.
---

# CI-gated MR Workflow

## The one rule

Own the delivery loop until the repository reaches an evidenced terminal state. Local checks prepare a change for remote CI; they never substitute for required review, pipeline, merge, or post-merge evidence.

## Activation boundary

Use this Skill when the user explicitly invokes it, or when repository instructions require CI-gated delivery for the concrete code or configuration change in scope.

Do not activate it for read-only analysis, planning without implementation, a user-requested local draft, or a trivial documentation-only change that repository policy permits on the default branch. Changing protected-branch settings, approval rules, release policy, or repository visibility needs separate authority; ordinary branch, commit, push, MR/PR, CI repair, merge, and cleanup steps stay inside an authorized implementation workflow.

## State machine

1. **Scope** — identify the repository, provider, default branch, protection policy, required checks, review requirements, release side effects, current branch, dirty files, and unrelated user changes. Stop before mutation if the target repository or authorization boundary is unresolved.
2. **Classify** — decide whether policy allows the change on the default branch. Code, configuration, CI, generated-runtime, and review-sensitive changes use a short branch. Do not invent an MR ceremony for a harmless documentation correction unless policy requires it.
3. **Branch** — update remote facts, confirm the base, preserve unrelated work, and create one traceable short-lived branch. Never overwrite another worktree or use destructive history repair to make the branch convenient.
4. **Local loop** — implement the smallest scoped change and run directly relevant checks after the last mutation. Record the command, exit status, and concise result. Treat missing, skipped, stale, or inferred verification as unverified.
5. **Commit and publish** — inspect the diff, stage explicit files, create focused commits, push the branch, and create or update the MR/PR with scope, acceptance, risks, and local evidence. Local Git command safety belongs to a dedicated Git guard plugin and is not reimplemented here.
6. **Review** — inspect the final scoped diff and request an independent reviewer when risk justifies it. Build the task and result packets from [`references/reviewer-handoff.md`](references/reviewer-handoff.md); never send the full conversation, private reasoning, unrelated files, or another reviewer's conclusions. Validate each finding against the current tree; resolve or explicitly reject every blocking discussion before merge.
7. **Supervise CI** — query the provider through structured tool or API output bound to the current head SHA. Use bounded polling with a terminal-state set, maximum attempts or deadline, and an explicit query-failure branch. If CI fails, read the failed job log, make the smallest repair, rerun local checks, push, and resume supervision.
8. **Gate merge** — require the expected head SHA, successful required jobs, satisfied approvals, resolved blocking discussions, and no unresolved merge conflict. Check for duplicate branch-push and MR pipelines for the same commit; report duplication instead of silently treating both as required evidence.
9. **Post-merge decision** — capture the merge commit and default-branch state. Wait for the default-branch pipeline unless repository policy permits an equivalence decision and the final MR head, merge tree, required job set, and absence of default-branch-only effects are all evidenced. If one condition is unknown, wait rather than infer.
10. **Finish** — update the local default branch to the merge commit, remove the task branch only after confirming it is merged, verify the remote branch policy outcome, and report unrelated stale branches without deleting them automatically.

## Remote observation contract

- Prefer provider-native structured tools or JSON APIs. GitLab textual success is `success`; GitHub conclusions include `success` and `failure`.
- Bind every pipeline observation to provider, repository, pipeline/run id, source, head SHA, status, and observation time.
- Empty output, authentication failure, permission denial, rate limiting, malformed JSON, and timeout are query failures, not pending CI.
- A remote mutation needs a subsequent read from the same provider and subject before it can be reported as successful.
- Never fabricate an MR URL, pipeline id, approval, discussion state, merge commit, or cleanup result.

## Remote decision invariants

- Select evidence by the current MR/PR head SHA first, then evaluate its status. A successful pipeline for any other SHA is stale evidence, even when it is newer by id or timestamp.
- Required jobs, approvals, mergeability, and blocking discussions are independent gates. One green gate never cancels a red or unknown gate.
- After a repair push, discard the earlier failure only for the merge decision; retain it in the evidence history and require a successful current-head pipeline.
- A merge is not delivery completion when policy requires the default-branch pipeline. Bind that pipeline to the observed merge commit and honor its own terminal state.
- Delete or update branches only after the provider read confirms the merge and the local commit is reachable from the updated default branch.

## Evidence report

Lead with the terminal state: delivered, externally blocked, or intentionally paused. Then report:

- branch and commit SHA;
- local commands and results, labeled as local observations;
- MR/PR URL and final head SHA;
- required CI jobs and terminal state from remote observations;
- review and unresolved-discussion state;
- merge commit and post-merge wait decision;
- final local branch, worktree status, and branch cleanup state;
- unverified items and the exact recovery action.

## Honest limits

This Skill is workflow guidance, not a remote authorization system. It ships no Git command Hook because local Git invariants already have a dedicated owner, and duplicate blockers would create conflicting recovery paths. It also ships no Stop Hook: without a provider-bound observation receipt, a Hook could enforce paperwork but could not prove review or CI success. Repository permissions, provider tools, and protected-branch policy remain the authorities for remote effects.
