---
name: evidence-driven-delivery
description: Run substantial coding, refactoring, documentation, artifact, analysis, or operational tasks through a falsifiable challenge, minimal change, targeted and complete fresh verification, adversarial review, and machine-checkable completion report. Use after a task will mutate workspace state or make test, artifact, Git, CI, or other completion claims; do not use for ordinary read-only questions with no completion claim.
---

# Evidence-Driven Delivery

Keep one owner for the task and its final verdict. Do not add agents or persistent ledgers solely to follow this workflow.

## Workflow

1. State a one-line contract: the caller-visible result and how it will be accepted.
2. Select one profile. Read [workflow-profiles.md](references/workflow-profiles.md) when the task mixes code and non-code work or the profile is unclear.
3. Establish the challenge before the authoritative change:
   - Behavior code: invoke `$tdd`; name the public seam, edit one focused test, and run it to an expected RED caused by the missing behavior.
   - Refactor: run the exact test command that must stay green.
   - Non-code work: run a negative check or dry-run, construct a falsifiable counterexample, or record why no challenge is available.
4. Make the smallest vertical change that satisfies the current contract. Do not combine unrelated cleanup.
5. Run targeted verification after the last relevant mutation.
6. Run complete verification after every mutation. Commands used as final evidence must be in the current user-prompt epoch; historical RED or baseline commands are process evidence only.
7. Review the final state through an independent path or adversarial counterexample. Treat model judgment as inferred unless a supported command, artifact, Git state, or CI receipt proves it.
8. Invoke `verification-evidence-reporting` and emit exactly one `verification-evidence/v2` block.

## Failure policy

- Do not rewrite a failed command as if it succeeded or use failure-masking shell syntax.
- Do not use `done_with_concerns` to hide a missing RED, baseline, final verification, or current receipt.
- If the process cannot be completed, report `blocked` or `needs_context` with the missing evidence and recovery action.
- Only the user may abandon the active evidence trail by submitting exactly `# verification-abort`.

## Output

Report the contract, challenge result, minimal change, targeted and complete verification, adversarial review, unsupported conclusions, and residual risk. Keep raw logs and secrets out of the response.
