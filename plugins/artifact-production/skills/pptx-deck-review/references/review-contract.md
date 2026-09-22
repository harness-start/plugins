# Review contract

Create an external JSON object using schema `presentation-production/review-input/v6`. Page hashes must match the current final PNGs.

```json
{
  "schema": "presentation-production/review-input/v6",
  "artifactId": "deck-id",
  "subjectDigest": "64-lowercase-hex",
  "verdict": "pass",
  "reviewer": {
    "kind": "independent-agent",
    "id": "stable-reviewer-id",
    "sessionId": "current-independent-session-id"
  },
  "pages": [
    {
      "index": 1,
      "sha256": "current-page-sha256",
      "verdict": "pass",
      "audits": {
        "headlineVoice": {
          "status": "pass",
          "classification": "plain",
          "evidence": "The title is a concrete label with no repeated slogan frame.",
          "signalDisposition": "Required only when the probe flags this title."
        },
        "typographyRhythm": {
          "status": "pass",
          "evidence": "Visible baselines, paragraph gaps, and vertical alignment match the OOXML evidence."
        },
        "contentEncoding": {
          "status": "pass",
          "evidence": "The visual adds a relationship or observation beyond the subtitle.",
          "signalDisposition": "Required only when the probe flags this composition."
        },
        "distanceLegibility": {
          "status": "pass",
          "evidence": "The payload remains readable at approximately 480×270; any fine interface detail has a readable crop or callout."
        },
        "grouping": {
          "status": "not-applicable",
          "evidence": "No peer group is declared.",
          "rationale": "This page contains one statement."
        },
        "readingPath": {
          "status": "not-applicable",
          "evidence": "No relationship diagram is declared.",
          "rationale": "This page contains one statement."
        }
      }
    }
  ],
  "checks": {
    "audienceBoundary": { "status": "pass", "anchors": ["slide:opening"], "evidence": "The cover addresses the audience without exposing the private brief." },
    "audienceCoverage": { "status": "pass", "anchors": ["deck"], "evidence": "The visible deck answers the material decision needs of every role in the declared audience." },
    "headlineVoice": { "status": "pass", "anchors": ["deck"], "evidence": "The title chain was read independently and contains no formulaic title." },
    "typographyRhythm": { "status": "pass", "anchors": ["deck"], "evidence": "Rendered text rhythm agrees with the bound OOXML measurements." },
    "contentEncoding": { "status": "pass", "anchors": ["deck"], "evidence": "Every primary visual adds information rather than decorating repeated prose." },
    "layoutRhythm": { "status": "pass", "anchors": ["deck"], "evidence": "Similar-page and composition signals were checked for mechanical repetition." },
    "relationshipSemantics": { "status": "not-applicable", "anchors": ["deck"], "evidence": "The storyboard contains no diagram slide.", "rationale": "No relationship-bearing slide is present." },
    "groupingSemantics": { "status": "not-applicable", "anchors": ["deck"], "evidence": "The storyboard contains no declared group.", "rationale": "No grouped peers are present." }
  },
  "findings": [],
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

Use `human` only for an actual human reviewer. The wrapper binds `reviewer.sessionId` to the one-time capability session and rejects the renderer's session.

`headlineVoice`, `typographyRhythm`, `contentEncoding`, and `distanceLegibility` are required on every page. Headline classification may be `plain` or `specific`; `formulaic` cannot pass. `grouping` and `readingPath` may be `not-applicable` only when the storyboard declares no matching structure, with evidence and a rationale. Review-level headline, composition, or text-fit signals require `signalDisposition` on that page. A blocking deck signal prevents admission and cannot be dispositioned.

Every deck check needs observable evidence and at least one `deck` or `slide:<id>` anchor. Only `relationshipSemantics` and `groupingSemantics` may be `not-applicable`, when the corresponding structure is absent. Every communication-review anchor must match the frozen signature-cue anchors.

Finding severities are `low`, `medium`, `high`, and `critical`. Resolved page findings require resolution evidence and the current page SHA-256. Accepted findings require a concrete acceptance reason; high and critical findings cannot be accepted. If any page or required check fails, return a non-pass Result Card without asking the wrapper to admit the review.
