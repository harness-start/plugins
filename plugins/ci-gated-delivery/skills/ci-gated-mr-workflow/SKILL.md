---
name: ci-gated-mr-workflow
description: Use only when the user explicitly invokes `$ci-gated-mr-workflow` or `/ci-gated-mr-workflow` for the current task. Do not select this workflow from an ordinary change request or repository policy alone.
---

# CI-gated MR Workflow

After the user explicitly invokes this Skill for the current task, it owns review requests, completion-time verification, and branch finish methods. PreToolUse only rejects default-branch merge or push commands that omit a bound head SHA. It does not activate this workflow or prove that required CI passed. Repository policy remains an independent constraint.

## The one rule

Own the delivery loop until the repository reaches an evidenced terminal state. Local checks prepare a change for remote CI; they never substitute for required review, pipeline, merge, or post-merge evidence.

## Activation boundary

Only activate this Skill when the user explicitly invokes `$ci-gated-mr-workflow` or `/ci-gated-mr-workflow` for the current task. Repository instructions, SessionStart text, ordinary change requests, descriptive mentions of the Skill, and a general preference for CI do not activate it.

Explicit invocation authorizes planning and read-only inspection first. Before creating a branch or worktree, committing, pushing, creating or updating an MR/PR, merging, or deleting a branch, show the exact operation and its effects, then wait for the user's explicit confirmation for that step. One confirmation does not authorize later steps. A worktree requires a separate explicit user request. Do not select this workflow for read-only analysis, local drafts, or ordinary implementation requests. Changes to protected branches, approval policy, repository visibility, or release policy require separate authority.

## State machine

1. **Scope** — identify the repository, provider, default branch, protection policy, required checks, review requirements, release side effects, current branch, dirty files, and unrelated user changes. Stop before mutation if the target repository or authorization boundary is unresolved.
2. **Classify** — decide whether policy allows the change on the default branch. Code, configuration, CI, generated-runtime, and review-sensitive changes use a short branch. Do not invent an MR ceremony for a harmless documentation correction unless policy requires it.
3. **Branch** — Update remote facts, confirm the base, and preserve unrelated work. Show the proposed branch operation and wait for confirmation. Work in the current checkout by default. Create a worktree only after a separate explicit user request. Never overwrite another worktree or use destructive history repair for convenience.
4. **Local loop** — implement the smallest scoped change and run directly relevant checks after the last mutation. Record the command, exit status, and concise result. Treat missing, skipped, stale, or inferred verification as unverified. Do not claim tests pass, a build succeeded, or a bug is fixed until this turn ran the proving command and the output confirms the claim.
5. **Commit and publish** — Inspect the diff and list the files to stage, target repository, branch, commits, and the effects of the push and MR/PR. Before committing, pushing, or creating or updating an MR/PR, wait for the user's explicit confirmation for that exact operation. After approval, stage only the named files and create focused commits. Describe scope, acceptance, risks, and local evidence in the MR/PR. A dedicated Git guard plugin owns local Git command safety; this plugin does not duplicate it.
6. **Review** — inspect the final scoped diff and request an independent reviewer when risk justifies it. Build the task and result packets from [`references/reviewer-handoff.md`](references/reviewer-handoff.md); never send the full conversation, private reasoning, unrelated files, or another reviewer's conclusions. Give the reviewer only description, requirements, base SHA, and head SHA. Validate each finding against the current tree; resolve or explicitly reject every blocking discussion before merge.
7. **Supervise CI** — query the provider through structured tool or API output bound to the current head SHA. Use bounded polling with a terminal-state set, maximum attempts or deadline, and an explicit query-failure branch. If CI fails, read the failed job log, make the smallest repair, rerun local checks, push, and resume supervision.
8. **Gate merge** — Require the expected head SHA, successful required jobs, satisfied approvals, resolved blocking discussions, and no unresolved merge conflict. Check whether branch-push and MR pipelines ran twice for the same commit, and report the duplication. Before merging, show the exact merge command and head SHA, then wait for a separate explicit confirmation. Earlier approval for a push or MR does not authorize the merge.
9. **Post-merge decision** — capture the merge commit and default-branch state. Wait for the default-branch pipeline unless repository policy permits an equivalence decision and the final MR head, merge tree, required job set, and absence of default-branch-only effects are all evidenced. If one condition is unknown, wait rather than infer.
10. **Finish** — after required remote evidence is green, present the human with merge-locally, open-or-keep-the-MR, or keep-the-branch. Do not discard a branch unless the human types an explicit discard confirmation. Update the local default branch to the merge commit, remove the task branch only after confirming it is merged, verify the remote branch policy outcome, and report unrelated stale branches without deleting them automatically. Merge and default-branch push commands must include the current head SHA in the same argv.

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

This Skill is workflow guidance, not a remote authorization system. Local Git add/commit/reset invariants stay with the Git guard plugin. This plugin's PreToolUse Hook only requires a head SHA on default-branch merge/push shapes and does not prove pipeline success. It ships no Stop Hook: without a provider-bound observation receipt, a Hook could enforce paperwork but could not prove review or CI success. Repository permissions, provider tools, and protected-branch policy remain the authorities for remote effects.
