# Review contract

Create an external JSON object with schema `brand-logo-production/review-input/v2`. Bind `artifactId`, current `subjectDigest`, every required artifact path and SHA-256, and a reviewer whose session is the current independent session. In Codex, use the exact `CODEX_THREAD_ID` for `reviewer.sessionId` and the absolute current child rollout path under `$CODEX_HOME/sessions` for `reviewer.transcriptPath`. Do not use `CODEX_SESSION_ID`, which identifies the parent in a spawned review. In a Claude review subagent, the plugin injects a trusted agent-scoped principal; use that exact value for `reviewer.sessionId`.

Set `decision` to `approved` only when all nine outcome checks pass; all six aesthetic criteria contain substantive notes, set `requiredMin` to 2, and score 2; and every blocker or major finding is `verified` against the current artifact with `recheckEvidence`. Do not average scores. Finding fields are `findingId`, `severity`, `evidenceAnchor`, `artifactDigest`, `fix`, `status`, and `recheckEvidence`. `evidenceAnchor` must be one of the required coverage paths and `artifactDigest` must exactly equal that path's current SHA-256.

Before reading the brief, record `reviewerRetell.observedBeforeContract`. Then bind the exact `communicationCore.retellTarget` as `intendedTarget`, set alignment to `pass` only for a faithful retell, and state the review limitation. Provide passing, evidence-bearing `coreFidelity`, `signatureCue`, `semanticCausality`, `retellAlignment`, and `invariantContinuity` objects under `communicationReview`; every object needs `anchor`, `evidence`, and `recovery`, and its anchor must be one of the frozen `communicationCore.signatureCue.anchors`.

Write the JSON outside the project, then invoke `node ${PLUGIN_ROOT}/dist/cli/harness.mjs logo review <project-root> <external-json>`. Do not edit the project directly.

Use this shape. `coverage` must contain every required review artifact exactly once in lexicographic path order.

```json
{
  "schema": "brand-logo-production/review-input/v2",
  "artifactId": "<artifact-id>",
  "subjectDigest": "<current-subject-sha256>",
  "decision": "approved",
  "reviewer": {
    "kind": "independent-agent",
    "id": "<stable-reviewer-id>",
    "sessionId": "<current-independent-session>",
    "transcriptPath": "<absolute-current-codex-child-rollout-path>"
  },
  "coverage": [
    { "path": "build/master/lockup.svg", "sha256": "<current-file-sha256>" }
  ],
  "checks": [
    { "id": "brief-fidelity", "status": "pass" },
    { "id": "wordmark-copy", "status": "pass" },
    { "id": "script-fidelity", "status": "pass" },
    { "id": "spacing-rhythm", "status": "pass" },
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
  "reviewerRetell": {
    "observedBeforeContract": "<one-sentence blind retell>",
    "intendedTarget": "<exact communication-core retell target>",
    "alignment": "pass",
    "limitation": "<what this independent review does not prove>"
  },
  "communicationReview": {
    "coreFidelity": { "status": "pass", "anchor": "<current artifact anchor>", "evidence": "<observation>", "recovery": "<verifiable correction>" },
    "signatureCue": { "status": "pass", "anchor": "<current artifact anchor>", "evidence": "<observation>", "recovery": "<verifiable correction>" },
    "semanticCausality": { "status": "pass", "anchor": "<current artifact anchor>", "evidence": "<observation>", "recovery": "<verifiable correction>" },
    "retellAlignment": { "status": "pass", "anchor": "<current artifact anchor>", "evidence": "<observation>", "recovery": "<verifiable correction>" },
    "invariantContinuity": { "status": "pass", "anchor": "<current artifact anchor>", "evidence": "<observation>", "recovery": "<verifiable correction>" }
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
