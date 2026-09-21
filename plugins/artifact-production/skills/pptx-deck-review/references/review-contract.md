# Review contract

Create a JSON object using schema `presentation-production/review-input/v4`:

```json
{
  "schema": "presentation-production/review-input/v4",
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
  "checks": {
    "audienceBoundary": {
      "status": "pass",
      "anchors": ["slide:opening"],
      "evidence": "Observable comparison between the cover and the private audience brief."
    },
    "headlineEconomy": {
      "status": "pass",
      "anchors": ["slide:opening"],
      "evidence": "The display title locates the page while the visual carries the assertion."
    },
    "visualPayload": {
      "status": "pass",
      "anchors": ["slide:opening"],
      "evidence": "The primary visual conveys information rather than decorating repeated prose."
    },
    "layoutRhythm": {
      "status": "pass",
      "anchors": ["deck"],
      "evidence": "The montage and layout-fingerprint groups were checked for mechanical repetition."
    },
    "relationshipSemantics": {
      "status": "not-applicable",
      "anchors": ["deck"],
      "evidence": "The storyboard contains no diagram slide.",
      "rationale": "No relationship-bearing slide is present."
    }
  },
  "findings": [
    {
      "id": "visual-001",
      "severity": "medium",
      "page": 1,
      "anchor": "slide:opening",
      "evidence": "Observable issue anchored to the current page.",
      "recovery": "Specific source correction and rerender step.",
      "disposition": "resolved",
      "resolutionEvidence": "The current page was rechecked after the correction.",
      "resolutionPageSha256": "current-page-sha256"
    }
  ],
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

Use `human` instead of `independent-agent` only for an actual human reviewer. The wrapper binds `reviewer.sessionId` to the one-time capability session and rejects the renderer's session. Page indexes must be contiguous; hashes must match the current final PNGs.

Every quality check needs observable evidence and at least one `deck` or `slide:<id>` anchor. Only `relationshipSemantics` may be `not-applicable`, and only when the storyboard contains no diagram; include a rationale. Every communication-review anchor must match the frozen signature-cue anchors.

Finding severities are `low`, `medium`, `high`, and `critical`. Resolved page findings require resolution evidence and the current page SHA-256. Accepted findings require a concrete acceptance reason; high and critical findings cannot be accepted. If any page or required check fails, return a non-pass Result Card without asking the wrapper to admit the review.
