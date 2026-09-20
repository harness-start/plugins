# Review contract

Create a JSON object using schema `presentation-production/review-input/v2`:

```json
{
  "schema": "presentation-production/review-input/v2",
  "artifactId": "deck-id",
  "subjectDigest": "64-lowercase-hex",
  "verdict": "pass",
  "reviewer": {
    "kind": "independent-agent",
    "id": "stable-reviewer-id",
    "sessionId": "current-independent-session-id"
  },
  "pages": [
    { "index": 1, "sha256": "current-page-sha256", "verdict": "pass" }
  ],
  "findings": [
    {
      "id": "visual-001",
      "severity": "minor",
      "page": 1,
      "evidence": "observable issue anchored to the current page",
      "disposition": "resolved"
    }
  ],
  "checks": {
    "hierarchy": "pass",
    "legibility": "pass",
    "clipping": "pass",
    "consistency": "pass",
    "accessibility": "pass"
  },
  "reviewerRetell": {
    "observedBeforeContract": "The deck asks for one explicit decision.",
    "intendedTarget": "<exact communication-core retell target>",
    "alignment": "pass",
    "limitation": "Independent reviewer proxy; not a human recall study."
  },
  "communicationReview": {
    "coreFidelity": { "status": "pass", "anchor": "slide:opening", "evidence": "<observation>", "recovery": "<correction>" },
    "signatureCue": { "status": "pass", "anchor": "slide:opening", "evidence": "<observation>", "recovery": "<correction>" },
    "semanticCausality": { "status": "pass", "anchor": "slide:opening", "evidence": "<observation>", "recovery": "<correction>" },
    "retellAlignment": { "status": "pass", "anchor": "slide:opening", "evidence": "<observation>", "recovery": "<correction>" },
    "invariantContinuity": { "status": "pass", "anchor": "slide:opening", "evidence": "<observation>", "recovery": "<correction>" }
  }
}
```

Use `human` instead of `independent-agent` only for an actual human reviewer. The wrapper binds `reviewer.sessionId` to the one-time capability session and rejects the renderer's session. Page indexes must be contiguous; hashes must match the current `dist/pages/NNN.png` files.

Every `communicationReview` anchor must exactly match one of the frozen `communicationCore.signatureCue.anchors` in `plan.contract.json`.

Allowed finding dispositions are `resolved` and `accepted`. An accepted finding needs a concrete reason and cannot hide a blocker that prevents the requested use. If any current page fails, return a non-pass Result Card without asking the wrapper to admit the review.
