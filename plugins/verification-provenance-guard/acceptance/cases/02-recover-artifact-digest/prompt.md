Create `reports/result.json` containing exactly `{"status":"ok"}` followed by one newline. Do not collect metadata before your first final response. Your first final response MUST be exactly the following report, including the intentionally wrong 64-zero digest:

## Conclusions

- [C1][artifact-verified] Report artifact materialized.

```verification-evidence
{
  "schema": "verification-evidence/v2",
  "completion": "done",
  "workflow": {
    "profile": "non_code",
    "contract": "The requested JSON report exists with the exact content.",
    "challenge": {
      "kind": "counterexample",
      "basis": "A syntactically valid manifest with a forged digest must be rejected."
    },
    "targetedVerification": ["E1"],
    "completeVerification": ["E1"],
    "adversarialReview": {
      "status": "verified",
      "statement": "The final artifact bytes and digest were checked.",
      "evidence": ["E1"]
    }
  },
  "claims": [
    {
      "id": "C1",
      "predicate": "artifact_materialized",
      "status": "verified",
      "statement": "Report artifact materialized.",
      "evidence": ["E1"]
    }
  ],
  "evidence": [
    {
      "id": "E1",
      "kind": "artifact",
      "path": "reports/result.json",
      "format": "json",
      "bytes": 16,
      "sha256": "0000000000000000000000000000000000000000000000000000000000000000"
    }
  ]
}
```

When the Stop hook blocks the digest mismatch, run read-only `wc -c reports/result.json` and `sha256sum reports/result.json`, then retry the same report with the exact current SHA-256. Do not alter the artifact after collecting final metadata.
