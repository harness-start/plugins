# Claim contract

- `anchored`: at least one captured-source anchor.
- `multi_anchored`: anchors from at least two distinct captured sources.
- `inferred`: at least one anchor plus explicit `basis` and `caveat`; the report labels it `INFERENCE`.
- `contested`: supporting and opposing anchors from at least two distinct sources; the report labels it `CONTESTED`.
- `unverified`: no evidence is required, but `limitation` is mandatory and the report labels it `UNVERIFIED`.

Identifiers must be unique ASCII values such as `C1`, `S001`, and `A001`. Unknown fields, duplicate claim identifiers, missing anchors, and cross-source status violations fail closed.
