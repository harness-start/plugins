---
name: interface-visual-critique
description: Read-only hierarchy, type, spacing, and contrast critique for interface files. No writer or release authority.
---

# Interface visual critique

This Skill is **read-only**. It cannot write UI files, update `DESIGN.md`, apply fixes, or stamp a product review. Inspect the supplied render or screenshot as well as the responsible source. When the project already provides a read-only render or browser check, it may be run to gather current visual evidence; do not install a new runtime or start a persistent live server just for critique.

## Review sequence

1. **Scope and blind first read** — bound the surface or diff. Before reading `DESIGN.md` or another intent contract, inspect representative desktop and mobile renders. Record the focal action, the signature cue you actually notice, and a one-sentence pre-contract retell. If no render exists, or the host cannot inspect image inputs, stop visual-tool exploration and mark this pass unverified. Do not substitute source inspection, computed styles, DOM metrics, pixel sampling, or a custom measurement harness for a human-visible first read; continue with the remaining contract and source checks while preserving that limitation.
2. **Contract comparison** — read the managed `DESIGN.md` block when present. Compare the product promise, intended retell, signature cue, semantic link, invariants, and prohibited drift against the blind first read. State missing intent as an assumption and never silently rewrite the target.
3. **Whole-render pass** — identify hierarchy, density rhythm, palette commitment, clipping, and responsive reflow. Use a squint test: hierarchy and the signature cue should survive when details blur.
4. **Independent lenses** — check hierarchy; typography and contrast; surfaces and depth; composition and spacing; component states and motion; reuse, semantics, content coherence, signature-cue continuity, and causal fit to the product promise.
5. **False-positive filter** — drop personal preference, coherent bold choices, ratified exceptions, untouched out-of-scope code, and lint concerns. A Hook fact is not automatically a design defect.
6. **Verdict** — report the pre-contract retell, intended target, alignment (`pass`, `partial`, or `fail`), and limitation; then synthesize only evidence-backed findings and state one bounded verdict.

## Finding contract

Every finding uses one row with:

| Severity | Responsible `file:line` | Evidence | User or product cost | Verifiable fix and recovery path | Status |
| --- | --- | --- | --- | --- | --- |
| `blocker`, `major`, or `minor` | exact responsible source anchor | render plus source fact | comprehension, operation, accessibility, or continuity impact | observable correction and how to recover if it fails | `verified` or `unverified` |

- **blocker** — broken operation/accessibility, absent focal hierarchy, clipped core content, inaccessible control, or a contradiction with the declared system that prevents approval.
- **major** — a real craft or continuity gap with visible user cost, but the surface remains operable.
- **minor** — bounded polish inconsistency; report sparingly.

Screenshot coordinates or viewport names may supplement evidence, but every finding still anchors the responsible project code at `file:line`. If responsibility cannot be located, record the observation under unverified notes rather than inventing an anchor.

## Lenses

Check one primary action and stable hierarchy; contrast and non-color encoding; type scale, line-height, and responsive measure; spacing groups before containers; component continuity; applicable default, hover, focus, active, selected, disabled, loading, error, success, and empty states; purposeful and interruptible motion; desktop/mobile reflow, clipping, reading order, and action reachability.

Latin body copy usually fits 55–75ch and CJK body copy 24–40 full-width characters; mixed-script runs must be checked against both at responsive breakpoints. Body tracking stays near normal; wide tracking is limited to short Latin uppercase labels.

## Verdict

- `approved` — no blockers, required evidence is present, and major findings are resolved.
- `changes_required` — at least one blocker or unresolved major finding remains.
- `unverified` — rendered evidence or another required verification path is unavailable. Source conformance alone cannot produce approval.

Do not recommend community `$impeccable` commands. Do not mutate files while reviewing.
