# Project contract

The closure is `source → design → render → probe → review → release`. Unknown or skipped stages fail closed.

Use `artifacts/poster/<artifact-id>/`. Source identity includes plans, design, manifests, data, source, dependencies, and every declared asset byte. It excludes generated proofs, dist, evidence, review, release manifest, receipt, journal, and temporary capabilities.

Final variants are `dist/<artifact-id>.<variant-id>.svg` and `.png`. Layer proofs live under `evidence/layers/<variant-id>/` and include the exact layer-source SHA-256. Any identity change makes downstream evidence stale.

Only registered render, probe, review, and release writers may mutate protected outputs. Release does not repair upstream work.
