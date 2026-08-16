# Review contract

Create a JSON object using schema `pptx-project-delivery-guard/review-input/v1`:

```json
{
  "schema": "pptx-project-delivery-guard/review-input/v1",
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
  }
}
```

Use `human` instead of `independent-agent` only for an actual human reviewer. The wrapper binds `reviewer.sessionId` to the one-time capability session and rejects the renderer's session. Page indexes must be contiguous; hashes must match the current `dist/pages/NNN.png` files.

Allowed finding dispositions are `resolved` and `accepted`. An accepted finding needs a concrete reason and cannot hide a blocker that prevents the requested use. If any current page fails, return a non-pass Result Card without asking the wrapper to admit the review.
