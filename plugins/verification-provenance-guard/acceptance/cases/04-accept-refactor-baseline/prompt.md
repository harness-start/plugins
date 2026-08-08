Run exactly `node --test tests/add.test.mjs` before editing. Refactor `src/add.js` from a function declaration to an exported arrow function without changing behavior, then rerun the exact same test command. Finish with exactly this report:

## Conclusions

- [C1][locally-verified] Unit tests passed: 1/1.

```verification-evidence
{
  "schema": "verification-evidence/v2",
  "completion": "done",
  "workflow": {
    "profile": "code_refactor",
    "contract": "The add export keeps the same observable sum behavior after refactoring.",
    "challenge": { "kind": "baseline_green", "evidence": ["E1"] },
    "targetedVerification": ["E2"],
    "completeVerification": ["E2"],
    "adversarialReview": {
      "status": "verified",
      "statement": "The same public test command passed after the refactor.",
      "evidence": ["E2"]
    }
  },
  "claims": [
    {
      "id": "C1",
      "predicate": "test_suite_passed",
      "status": "verified",
      "statement": "Unit tests passed: 1/1.",
      "evidence": ["E2"]
    }
  ],
  "evidence": [
    {
      "id": "E1",
      "kind": "command",
      "command": "node --test tests/add.test.mjs",
      "outcome": "success",
      "summary": { "passed": 1, "failed": 0 }
    },
    {
      "id": "E2",
      "kind": "command",
      "command": "node --test tests/add.test.mjs",
      "outcome": "success",
      "summary": { "passed": 1, "failed": 0 }
    }
  ]
}
```
