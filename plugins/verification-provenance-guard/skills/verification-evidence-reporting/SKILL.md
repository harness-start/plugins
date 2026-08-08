---
name: verification-evidence-reporting
description: Build the machine-checkable verification-evidence/v2 appendix required after workspace mutations and for test, lint, artifact, Git, CI, or completion claims. Use only after challenge, change, targeted verification, complete fresh verification, and adversarial review have run; use v1 only for legacy claim-only responses without mutations.
---

# Verification Evidence Reporting

Build the final appendix consumed by `verification-provenance-guard`. A label is not evidence. Never mark a conclusion verified unless the plugin can match it to a current command receipt, current artifact, live Git state, or captured structured CI result.

## Workflow

1. Inventory every conclusion about tests, lint/typecheck/build, output files, Git, CI, and semantic correctness.
2. Separate process evidence from completion evidence. RED and refactor baselines may be historical; targeted, complete, and verified review commands must follow the last mutation and run in the current user-prompt epoch.
3. Classify claims as `verified`, `inferred`, or `unverified`. Arbitrary business semantics and design quality are never automatically verified.
4. Record the selected workflow profile and evidence IDs. Use the exact commands that ran.
5. Write one visible `C#` line per claim, followed by exactly one `verification-evidence` JSON block.
6. Self-check IDs, tags, statements, references, completion state, and JSON syntax.

## Evidence rules

- A v2 command uses `outcome: success | expected_failure`. `expected_failure` requires a parsed `summary.failed > 0`, may only support the challenge, and never supports a completion claim.
- Do not use `|| true`, `; true`, `set +e`, a pipeline without `pipefail`, write/fix flags, redirection, or trailing commands as evidence.
- Artifacts must be regular files inside the workspace. The guard rechecks size, SHA-256, containment, and basic format at Stop.
- CI requires a captured structured success containing provider, pipeline ID, SHA, URL, and the exact query.
- Keep logs, file contents, tokens, credentials, and environment dumps out of the manifest.

## Code behavior template

````markdown
## Conclusions

- [C1][locally-verified] Unit tests passed: 15/15.

```verification-evidence
{
  "schema": "verification-evidence/v2",
  "completion": "done",
  "workflow": {
    "profile": "code_behavior",
    "contract": "The public module exposes the requested behavior.",
    "challenge": { "kind": "red_test", "evidence": ["E1"] },
    "targetedVerification": ["E2"],
    "completeVerification": ["E2"],
    "adversarialReview": {
      "status": "verified",
      "statement": "The public regression path was rerun against the final state.",
      "evidence": ["E2"]
    }
  },
  "claims": [
    {
      "id": "C1",
      "predicate": "test_suite_passed",
      "status": "verified",
      "statement": "Unit tests passed: 15/15.",
      "evidence": ["E2"]
    }
  ],
  "evidence": [
    {
      "id": "E1",
      "kind": "command",
      "command": "node --test tests/*.test.mjs",
      "outcome": "expected_failure",
      "summary": { "passed": 14, "failed": 1 }
    },
    {
      "id": "E2",
      "kind": "command",
      "command": "node --test tests/*.test.mjs",
      "outcome": "success",
      "summary": { "passed": 15, "failed": 0 }
    }
  ]
}
```
````

## Completion policy

- `done` requires every claim and `adversarialReview` to be verified.
- `done_with_concerns` is valid for inferred or unverified conclusions, but never repairs a missing required code sequence or fresh final evidence.
- `blocked` and `needs_context` may use empty final verification arrays and an unverified review when they state the actual missing evidence.
- `not_applicable` challenge cannot use `done`.
- After mutations, v1 is rejected. v1 remains available only for legacy claim-only responses with no observed mutation.

Read [evidence-schema.md](references/evidence-schema.md) for exact field shapes and non-code examples.
