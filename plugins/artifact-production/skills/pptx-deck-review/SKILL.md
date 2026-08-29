---
name: pptx-deck-review
description: Independently review the final rendered PNG pages of a PPTX project for visual hierarchy, consistency, legibility, clipping, content coherence, and accessibility, then produce the external review-input JSON consumed by presentation-production. Use only after render and probe; never use in the producing or releasing session.
---

# PPTX Deck Review

Act as an independent, read-only reviewer. Read [Review contract](references/review-contract.md) before starting. Do not edit the project, its source, evidence, pages, or receipt.

Inspect every final `dist/pages/NNN.png` at readable resolution. Compare the page order and hashes supplied by the producer with the manifest. Review narrative continuity, assertion clarity, hierarchy, density, alignment, typography, color use, contrast, non-color encoding, clipping, image quality, and consistency.

Write one external JSON file outside the project root. Set `reviewer.sessionId` to the host session id reported by the guard, then invoke the exact registered `node ${PLUGIN_ROOT}/dist/cli/harness.mjs presentation review <project-root> <external-json>` wrapper in this reviewer session. This wrapper is your only project mutation. A `pass` verdict is allowed only when every page is covered and every finding is either fixed in a newly rendered artifact or explicitly accepted with a reason. Never reuse findings against changed page hashes.

Return a short Result Card containing the review-input path, admitted review hash, inspected page hashes, remaining accepted risks, checks performed, and gaps. Do not claim structure, editability, or release validity; those belong to the probe and release gates.
