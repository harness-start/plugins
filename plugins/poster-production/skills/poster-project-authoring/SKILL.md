---
name: poster-project-authoring
description: Orchestrate a new deterministic digital poster project from brief through art direction, design system, Satori source, SVG and PNG rendering, evidence probes, independent review, and release. Use for creating regional-culture, Mondo-inspired, editorial, academic, or custom posters under artifacts/poster; do not use for a read-only critique or for editing an existing flattened image.
---

# Poster Project Authoring

Create an original SVG/PNG poster whose brief, assets, source, outputs, evidence, and review remain reproducibly bound. The main agent owns user intent, project files, advisor integration, gate decisions, and final reporting.

## Required references

Read all of these before authoring:

- [Project contract](references/project-contract.md)
- [Profiles](references/profiles.md)
- [Skill composition](references/skill-composition.md)
- [Design system](references/design-system.md)
- [Quality gates](references/quality-gates.md)
- [Assets and accessibility](references/assets-accessibility.md)

## Workflow

1. Select exactly one profile and a lowercase kebab-case artifact id. Run registered `project-init.mjs <root> --profile <profile>`.
2. Replace the scaffold brief with the user-approved audience, objective, language, assumptions, and terminal `targetStage` (normally `release`) in `plan.contract.json`; freeze the matching direction in `plan.art-direction.json`. Record every advisor as `used`, `skipped`, or `unavailable` at its exact revision.
3. Treat advisors as read-only. Integrate their useful advice into project-owned JSON or TSX; never run their scripts or accept their outputs as evidence, review, or release authority.
4. Register all user, generated, licensed, and public-domain assets in `plan.assets.json` before use. AI imagery is an input asset, never the complete deliverable.
5. Freeze `design.system.json`, exact copy in `data/<variant>.json`, variant order, dimensions, safe area, typography roles, color roles, and contrast pairs.
6. Implement isolated `buildLayer` modules. Layers do not fetch, write, spawn, use nondeterminism, assign z-index, or import sibling layers.
7. Run `project-lint.mjs`, then the registered `project-render.mjs`. The render writer generates self-contained SVG and rasterizes it deterministically to PNG.
8. Run `project-probe.mjs`. Resolve SVG safety, byte-equivalence, dimension, blank-output, typography-minimum, contrast, and accessibility failures by changing inputs, then repeat lint → render → probe.
9. Provide only the project root, current PNGs and digests, and the review-input contract to an independent `$poster-project-review` session. The reviewer creates its input outside the project and invokes `project-review.mjs` itself.
10. After an admitted `review.poster.json`, run `project-release.mjs`. Report only `release.manifest.json` outputs and label verification claims with provenance.

Use each wrapper as a standalone exact command. Generated paths are protected; mutating wrappers consume a short-lived session-, argv-, and subject-bound capability. Allow at most two producer/reviewer rounds. After a source, asset, copy, design, or dimension change, restart at lint.

Do not imitate a named living artist. Translate references into general composition, material, color, typography, and narrative principles and require original subject-specific relationships.
