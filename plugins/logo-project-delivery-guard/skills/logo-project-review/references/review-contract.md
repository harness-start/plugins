# Review contract

Create an external JSON object with schema `logo-project-delivery-guard/review-input/v1`. Bind `artifactId`, current `subjectDigest`, every required artifact path and SHA-256, and a reviewer whose session is the current independent session.

Set `decision` to `approved` only when geometry, legibility, and variants pass; the three aesthetic criteria contain substantive notes, set `requiredMin` to at least 2, and meet their thresholds; and every blocker or major finding is `verified` against the current artifact with `recheckEvidence`. Finding fields are `findingId`, `severity`, `evidenceAnchor`, `artifactDigest`, `fix`, `status`, and `recheckEvidence`. `evidenceAnchor` must be one of the required coverage paths and `artifactDigest` must exactly equal that path's current SHA-256.

Write the JSON outside the project, then invoke `project-review.mjs <project-root> <external-json>`. Do not edit the project directly.

Use this shape. `coverage` must contain every required review artifact exactly once in lexicographic path order.

```json
{
  "schema": "logo-project-delivery-guard/review-input/v1",
  "artifactId": "<artifact-id>",
  "subjectDigest": "<current-subject-sha256>",
  "decision": "approved",
  "reviewer": {
    "kind": "independent-agent",
    "id": "<stable-reviewer-id>",
    "sessionId": "<current-independent-session>"
  },
  "coverage": [
    { "path": "build/master/lockup.svg", "sha256": "<current-file-sha256>" }
  ],
  "checks": [
    { "id": "geometry", "status": "pass" },
    { "id": "legibility", "status": "pass" },
    { "id": "variants", "status": "pass" }
  ],
  "criteria": {
    "singleMemoryPoint": { "score": 2, "requiredMin": 2, "note": "<substantive observation>" },
    "opticalCraft": { "score": 2, "requiredMin": 2, "note": "<substantive observation>" },
    "markWordmarkSystem": { "score": 2, "requiredMin": 2, "note": "<substantive observation>" }
  },
  "findings": [
    {
      "findingId": "visual-001",
      "severity": "minor",
      "evidenceAnchor": "build/master/lockup.svg",
      "artifactDigest": "<same-current-file-sha256>",
      "fix": "<verifiable fix or recovery path>",
      "status": "open",
      "recheckEvidence": ""
    }
  ]
}
```

Allowed severities are `blocker`, `major`, `minor`, and `info`; allowed statuses are `open`, `fixed_pending_recheck`, and `verified`. An empty `findings` array is valid when the inspection found no issue.
