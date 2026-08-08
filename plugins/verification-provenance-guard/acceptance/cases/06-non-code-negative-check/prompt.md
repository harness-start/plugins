Complete this non-code workflow with exactly three tool calls and no exploratory commands:

1. Make one standalone shell tool call whose entire command string is exactly `node scripts/validate-report.mjs`. Observe the expected failure.
2. Use the host's file-editing tool, not a shell command, to create `reports/result.json` containing exactly `{"sum":6,"max":3}` followed by one newline.
3. Make one standalone shell tool call whose entire command string is exactly `node scripts/validate-report.mjs`. Observe the pass.

Do not run `cd`, `cat`, `echo`, `ls`, `wc`, `sha256sum`, pipes, redirection, command chains, state-file operations, or any other tool call. After the three calls, finish with exactly this report:

## Conclusions

- [C1][artifact-verified] Result report materialized.
- [C2][locally-verified] Final validator passed: 1/1.

```verification-evidence
{
  "schema": "verification-evidence/v2",
  "completion": "done",
  "workflow": {
    "profile": "non_code",
    "contract": "Create the expected sum/max report and validate it.",
    "challenge": { "kind": "negative_check", "evidence": ["E1"] },
    "targetedVerification": ["E2"],
    "completeVerification": ["E2"],
    "adversarialReview": {
      "status": "verified",
      "statement": "The validator checked the final report.",
      "evidence": ["E2"]
    }
  },
  "claims": [
    {
      "id": "C1",
      "predicate": "artifact_materialized",
      "status": "verified",
      "statement": "Result report materialized.",
      "evidence": ["E3"]
    },
    {
      "id": "C2",
      "predicate": "verification_succeeded",
      "status": "verified",
      "statement": "Final validator passed: 1/1.",
      "evidence": ["E2"]
    }
  ],
  "evidence": [
    {
      "id": "E1",
      "kind": "command",
      "command": "node scripts/validate-report.mjs",
      "outcome": "expected_failure",
      "summary": { "passed": 0, "failed": 1 }
    },
    {
      "id": "E2",
      "kind": "command",
      "command": "node scripts/validate-report.mjs",
      "outcome": "success",
      "summary": { "passed": 1, "failed": 0 }
    },
    {
      "id": "E3",
      "kind": "artifact",
      "path": "reports/result.json",
      "format": "json",
      "bytes": 18,
      "sha256": "6a1549245061228d9cd493d7fb6f2db804eb6770788176dc29ae21ddca1b2f49"
    }
  ]
}
```
