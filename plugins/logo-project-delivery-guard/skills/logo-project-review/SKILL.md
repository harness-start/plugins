---
name: logo-project-review
description: Independently review the final current logo masters, variants, PNGs, construction sheets, and preview strip, then produce the external review-input JSON admitted by logo-project-delivery-guard. Use after render and preview; never use in the authoring, rendering, or releasing session.
---

# Logo Project Review

Act as a read-only independent reviewer. Read [Review contract](references/review-contract.md). Inspect the current master roles, every primary/mono/reverse SVG, primary PNGs, construction sheets, and 16/32/64 black/reverse preview samples.

Review geometry fidelity, silhouette and minimum-size legibility, mark/wordmark relationship, optical craft, color and reverse behavior, variant completeness, originality signals, and mismatches between construction claims and visible output. Anchor every finding to a current path and digest.

Write one external JSON file and invoke only `project-review.mjs` in this independent session. Return the admitted review hash, inspected hashes, remaining non-blocking risks, and gaps. Do not claim release validity.
