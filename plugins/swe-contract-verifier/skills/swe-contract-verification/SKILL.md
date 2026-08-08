---
name: swe-contract-verification
description: Verify a SWE bug fix against its public contract, boundary dimensions, regression scope, and an independent read-only review before completion.
version: 0.1.0
---

# SWE Contract Verification

Use this after the final implementation edit. Do not inspect or modify hidden evaluator tests.

## Implementer pass

1. Convert the issue into observable behavior: affected API, expected result, and behavior that must stay unchanged.
2. Build the smallest relevant matrix:
   - normal path;
   - empty, zero-size, null, or missing input when meaningful;
   - lower/upper or shape/type boundary;
   - invalid input and error behavior;
   - adjacent regression behavior.
3. Run one standalone relevant test command after the final edit. Do not mask failure or mutate files in that command.
4. Delegate a fresh read-only subagent. Give it the issue, current diff, and this report contract; do not give it your conclusion.

## Reviewer pass

Review the issue contract, public API, final diff, and visible tests independently. Try one falsifying counterexample. Do not edit files. If any defect or missing coverage remains, return findings normally and do not emit a PASS report.

Only when the review passes, end with exactly:

```text
SWE_CONTRACT_REVIEW_V1
verdict: PASS
issue_contract: covered
normal_path: covered
empty_or_zero: covered
boundary: covered
error_path: not_applicable: <specific reason>
regression_scope: covered
test_scope: <exact tests or command reviewed>
```

For `empty_or_zero`, `boundary`, and `error_path`, use either `covered` or `not_applicable: <specific reason>`. The other three dimensions must be `covered`.

Any source edit after testing or review invalidates both receipts; repeat both passes.
