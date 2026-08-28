---
name: poster-visual-critique
description: Read-only hierarchy and contrast critique for posters. No writer or release authority.
---

# Poster visual critique

Audit a rendered poster against its declared art direction and design system. This adviser is read-only: it cannot write project files, create evidence, invoke writers, stamp independent review, or release an artifact.

## Inputs

Read the current brief, `plan.art-direction.json`, `design.system.json`, variant and layer manifests, and the rendered PNG at full size and at a thumbnail no wider than 320 px. Treat declarations as hypotheses; cite visible evidence from the rendered variant.

## Audit dimensions

1. **Brief fidelity** — identify the audience, objective, display environment, must-keep constraints, allowed changes, and exclusions. Flag visible choices that contradict them.
2. **Focal hierarchy** — verify that the declared `primaryFocalLayer` is the first visual read, remains recognizable at thumbnail size, and sits inside the declared `focalBox`. Distinguish scale, contrast, position, isolation, and semantic salience.
3. **Negative-space topology** — inspect each declared quiet region as a functional shape, not leftover emptiness. Report contamination, accidental tangencies, trapped holes, and competing edge activity.
4. **CJK/Latin typography** — inspect exact glyphs, punctuation, line breaks, script pairing, weight, orientation, alignment, tracking policy, and hierarchy role. Do not approve Latin tracking merely because it looks acceptable on Chinese text, or vice versa.
5. **Color system** — map visible colors to core, structural roles, and the variant's scenario. Flag decorative swatches, unstable role swaps, weak contrast, and color-only meaning.
6. **Material and light** — check that texture scale, surface response, highlight behavior, shadow direction, softness, and contrast form one physical story. Flag texture pasted over unrelated geometry or lighting that contradicts the declared material.
7. **Title/media relation** — compare visible overlap and depth order with the declared `depth` and `mechanism`; a claimed mask or interruption must be visibly causal, not merely adjacent.
8. **Copy and integrity** — verify required copy, asset provenance expectations, clipping, safe-area breaches, pseudo-text, decorative metadata, and unintended marks.

## Finding format

Return one row per issue:

```text
severity: low|medium|high|critical
anchor: variant:<id> / layer:<id> / region:<id> / typography:<role> / color:<role>
evidence: directly observable condition and the declared contract it conflicts with
recovery: a concrete source-level change and the probe or review step that verifies it
```

Separate facts from inference. For every high or critical finding, include one adversarial counterexample: describe a plausible interpretation under which the design might be intentional, then state what additional evidence would confirm or falsify that interpretation. Never mark findings resolved or accepted; disposition belongs to the independent review workflow.
