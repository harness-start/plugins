# Review contract

Input schema: `poster-production/review-input/v2`.

Required root fields: `artifactId`, current `subjectDigest`, `verdict: pass`, `reviewer`, `variants`, `checks`, and `findings`.

`reviewer` declares `kind: human|independent-agent`, stable `id`, and the current independent `sessionId`. Each variant declares `id`, current `pngSha256`, and `verdict: pass`.

Checks `hierarchy`, `typography`, `legibility`, `clipping`, `color`, `copy`, `profileFidelity`, and `assetIntegrity` must all equal `pass`. Inspect full size and a thumbnail no wider than 320 px.

Each finding declares `severity: low|medium|high|critical`, exact `anchor`, `evidence`, `recovery`, and `disposition: resolved|accepted`. High and critical findings cannot be accepted without explicit user authority; otherwise return them unresolved and do not invoke the writer.
