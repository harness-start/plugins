# Reviewer handoff

Use one read-only reviewer for a bounded question. The parent keeps implementation ownership and validates every returned finding against the current tree.

Never send or include the full conversation or transcript, private reasoning, unrelated files, credentials, or another reviewer's conclusions. A reviewer receives only the facts needed to challenge the scoped change.

## Task Brief

```text
Objective:
Non-goals:
Allowed files:
Base:
Head:
Scoped diff or provider location:
Verification evidence:
Forbidden context: full conversation, private reasoning, unrelated files, prior reviewer conclusions
Required checks:
Output: one Result Card per finding; return NO_FINDINGS when none are evidenced
```

Use exact base and head identifiers. If the diff is unavailable, say so and provide its provider location; never reconstruct or summarize an unseen diff. `Allowed files` is a boundary, not a suggestion.

## Result Card

```text
Severity: critical | important | minor | question
File anchor: path:line or provider diff anchor
Concrete evidence:
Requirement violated:
Verifiable fix or recovery:
Verification performed:
Assumptions:
Gaps:
```

Reject a finding that lacks an exact anchor, concrete evidence, and a verifiable fix or recovery path. Reopen the referenced file or provider diff before changing code. Reviewers stay read-only; the parent performs repairs and targeted verification.
