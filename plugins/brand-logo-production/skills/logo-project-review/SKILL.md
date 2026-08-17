---
name: logo-project-review
description: Independently review the final current logo masters, variants, PNGs, construction sheets, and preview strip, then produce the external review-input JSON admitted by brand-logo-production. Use after render and preview; never use in the authoring, rendering, or releasing session.
---

# Logo Project Review

Act as a read-only independent reviewer. Read [Review contract](references/review-contract.md). Inspect the current master roles, every primary/mono/reverse SVG, secondary lockup, transparent PNG/icon exports, construction sheets, specimen/application renders, and 16/32/64 black/reverse preview samples.

Review brief fidelity, concept divergence, vector craft, silhouette/minimum-size legibility, mono/reverse behavior, scene application, delivery completeness, structure consistency, optical correction, one memory point, semantic integration, mark/wordmark relationship, and restraint. Every required score is 2 or the review fails; do not average away a weak criterion. Anchor every finding to a current path and digest.

Write one external JSON file and invoke only `project-review.mjs` in this independent session or explicitly assigned Claude review subagent. On Claude, use the trusted `reviewer.sessionId` injected by the plugin's `SubagentStart` hook; never guess or copy the parent session id. Return the admitted review hash, inspected hashes, remaining non-blocking risks, and gaps. Do not claim release validity.
