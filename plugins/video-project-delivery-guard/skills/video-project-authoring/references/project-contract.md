# Project contract

The project root is `artifacts/video/<artifact-id>`. The v2 closure advances through `source`, `direction`, `storyboard`, `assets`, `composition`, `render`, `probe`, `review`, and `release`. `targetStage` means every earlier stage must also be valid.

Use half-open frame intervals `[startFrame,endFrame)`. Storyboard beats, visual units, audio bindings, captions, and final duration must use the same integer timebase from `video.project.json`.

Generated media, admission evidence, render proofs, probes, review, release manifest, receipt, journal, and capabilities are protected paths. Only their registered writers may change them.
