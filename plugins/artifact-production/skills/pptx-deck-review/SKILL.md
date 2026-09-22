---
name: pptx-deck-review
description: "Independently review the final rendered PNG pages of a PPTX v5 project for audience boundary, headline voice, text rhythm, content encoding, grouping, layout rhythm, relationship semantics, legibility, and accessibility, then produce the external review-input JSON. Use only after render and probe; never use in the producing or releasing session."
---

# PPTX Deck Review

## When to use

- Independently review a rendered PPTX v5 deck and submit evidence-bound review input.

## Constraints

- Do not edit the project, its source, evidence, pages, or receipt.

Act as an independent, read-only reviewer. Read [Review contract](references/review-contract.md) before starting. Do not edit the project, its source, evidence, pages, or receipt.

## Two-pass review

First inspect the complete montage of final `dist/pages/NNN.png` files before reading the plan. Record the first conclusion or action you recover, a one-sentence pre-contract retell, cover language that appears to expose an internal brief, and repeated-layout runs. Then inspect every page at readable resolution and compare current hashes, manifest, storyboard, probe evidence, and communication core.

Complete all seven v5 deck checks with page or deck anchors and observable evidence:

- `audienceBoundary`: the deck speaks to its audience without casually announcing the private target-audience brief; any explicit addressing matches the plan rationale.
- `headlineVoice`: read the title chain without body copy, classify each title as plain, specific, or formulaic, and reject a pass if any remains formulaic. Compactness alone is not evidence of natural language. Explicitly dispose every probe headline signal.
- `typographyRhythm`: compare visible baselines, line spacing, paragraph spacing, left/top alignment, and clipping with emitted OOXML evidence.
- `contentEncoding`: state what each primary visual communicates beyond the subtitle. Explicitly dispose every composition signal; a repeated card grid or bottom strip is not meaningful by itself.
- `layoutRhythm`: similar-page groups from design evidence are either intentional or reported as findings.
- `relationshipSemantics`: graph topology matches the claim, forward paths follow the declared physical reading direction, and connectors meet their nodes with the intended arrow, association, or break semantics. Use `not-applicable` only when no diagram exists.
- `groupingSemantics`: peer items use real bullets, numbering, aligned stacks, or grids. Use `not-applicable` only when no group is declared.

Every page entry includes hash-bound audits for `headlineVoice`, `typographyRhythm`, `contentEncoding`, `grouping`, and `readingPath`. The first three always pass with observable evidence. Grouping and reading path may be `not-applicable` only when the storyboard declares no corresponding structure, with a rationale. A signaled page also records a `signalDisposition` in the relevant audit.

Also review core fidelity, signature-cue continuity, density, alignment, typography, color, contrast, non-color encoding, clipping, image quality, accessibility, and the internal consistency of SVG diagrams.

Write one external JSON file outside the project root. Set `reviewer.sessionId` to the host session id reported by the guard, then invoke the exact registered `node ${PLUGIN_ROOT}/dist/cli/harness.mjs presentation review <project-root> <external-json>` wrapper in this reviewer session. This wrapper is your only project mutation. A pass is allowed only when every page and required check passes. Every finding needs severity, anchor, evidence, recovery, and either resolution evidence or an acceptance reason; resolved page findings also bind the current page SHA-256, and high or critical findings cannot be accepted. Never reuse findings against changed page hashes.

Return a short Result Card containing the review-input path, admitted review hash, inspected page hashes, remaining accepted risks, checks performed, and gaps. Do not claim structure, editability, or release validity; those belong to the probe and release gates.

## References

- [review-contract.md](references/review-contract.md)
