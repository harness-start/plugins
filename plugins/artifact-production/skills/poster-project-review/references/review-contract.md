# Review contract

Input schema: `poster-production/review-input/v4`.

Required root fields: `artifactId`, current `subjectDigest`, `verdict: pass`, `reviewer`, `variants`, `checks`, `reviewerRetell`, `communicationReview`, and `findings`.

`reviewer` declares `kind: human|independent-agent`, stable `id`, and the current independent `sessionId`. Each variant declares `id`, current `pngSha256`, and `verdict: pass`.

Checks `hierarchy`, `typography`, `scriptTypography`, `composition`, `negativeSpace`, `focalDominance`, `legibility`, `clipping`, `color`, `colorSystem`, `materialLighting`, `copy`, `profileFidelity`, and `assetIntegrity` are objects with `status: pass`, exact `anchor`, concrete `evidence`, and a verifiable `recovery`. Boolean or string-only checks are invalid. Inspect full size and a thumbnail no wider than 320 px. Compare focal geometry, quiet-region occupancy, mass-to-void balance, and title/media depth with current `evidence.composition.json`; do not infer them from art-direction prose alone.

Inspect before reading the direction and record `reviewerRetell.observedBeforeContract`. Bind the exact communication-core target as `intendedTarget`, set `alignment: pass` only for a faithful retell, and state the limitation. `communicationReview` contains `coreFidelity`, `signatureCue`, `semanticCausality`, `retellAlignment`, and `invariantContinuity`; each is a passing object whose anchor is one of the frozen signature-cue anchors, with concrete `evidence` and verifiable `recovery`.

Each finding declares `severity: low|medium|high|critical`, exact `anchor`, `evidence`, `recovery`, and `disposition: resolved|accepted`. High and critical findings cannot be accepted; resolve them and rerun review. User acknowledgement is not outcome evidence.
