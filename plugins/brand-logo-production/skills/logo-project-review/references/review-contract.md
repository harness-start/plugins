# Review contract

Create an external JSON object with schema `brand-logo-production/review-input/v1`. Bind `artifactId`, current `subjectDigest`, every required artifact path and SHA-256, and a reviewer whose session is the current independent session. In a Claude review subagent, the plugin injects a trusted agent-scoped principal; use that exact value for `reviewer.sessionId`.

Set `decision` to `approved` only when all six outcome checks pass; all six aesthetic criteria contain substantive notes, set `requiredMin` to 2, and score 2; and every blocker or major finding is `verified` against the current artifact with `recheckEvidence`. Do not average scores. Finding fields are `findingId`, `severity`, `evidenceAnchor`, `artifactDigest`, `fix`, `status`, and `recheckEvidence`. `evidenceAnchor` must be one of the required coverage paths and `artifactDigest` must exactly equal that path's current SHA-256.

Write the JSON outside the project, then invoke `project-review.mjs <project-root> <external-json>`. Do not edit the project directly.

Use this shape. `coverage` must contain every required review artifact exactly once in lexicographic path order.

```json
{
  "schema": "brand-logo-production/review-input/v1",
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
    { "id": "brief-fidelity", "status": "pass" },
    { "id": "concept-divergence", "status": "pass" },
    { "id": "vector-craft", "status": "pass" },
    { "id": "mono-reverse", "status": "pass" },
    { "id": "scene-application", "status": "pass" },
    { "id": "delivery-profile", "status": "pass" }
  ],
  "criteria": {
    "structureConsistency": { "score": 2, "requiredMin": 2, "note": "<substantive observation>" },
    "opticalCorrection": { "score": 2, "requiredMin": 2, "note": "<substantive observation>" },
    "singleMemoryPoint": { "score": 2, "requiredMin": 2, "note": "<substantive observation>" },
    "semanticIntegration": { "score": 2, "requiredMin": 2, "note": "<substantive observation>" },
    "markWordmarkSystem": { "score": 2, "requiredMin": 2, "note": "<substantive observation>" },
    "restraint": { "score": 2, "requiredMin": 2, "note": "<substantive observation>" }
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
