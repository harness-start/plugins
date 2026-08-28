---
name: diagram-project-authoring
description: Create or import a deterministic diagram project and carry it through semantic source, design, SVG/PNG/HTML/draw.io rendering, probes, independent review, and release. Use for flowcharts, architecture diagrams, process maps, timelines, charts, and related visuals under artifacts/diagram; do not use for a read-only critique.
---

# Diagram Project Authoring

Own the artifact in `artifacts/diagram/<id>/`. Keep meaning in `src/diagram.json`; generated geometry and delivery files are evidence, not the source of truth.

## Workflow

1. Run registered `project-init.mjs <root>` with a lowercase kebab-case id.
2. Freeze audience, objective, language, assumptions, and terminal `targetStage` in `plan.contract.json`.
3. Select one of the 27 declared diagram types. Prefer the smallest type that expresses the relationship. Keep labels short, group by semantics, and budget density before styling.
4. For existing material, run registered `project-import.mjs <root> <absolute-source>`. Inspect `plan.import-ledger.json`; resolve or explicitly accept every approximation and loss. Supported Mermaid grammars are bounded; unsupported grammar must fail. draw.io imports never follow URLs or scripts.
5. Tune `design.system.json` on the 4px grid. Use orthogonal routing for graph families, semantic color roles, readable contrast, and at least one non-color encoding for status.
6. Run `project-lint.mjs <root>`, then registered `project-render.mjs <root>`. The writer emits the JSON source plus self-contained SVG, deterministic PNG, self-contained HTML, and optional editable `.drawio`.
7. Run registered `project-probe.mjs <root>`. Resolve stale hashes, unsafe SVG, SVG/PNG mismatch, density, clipping, or accessibility failures from source and repeat lint → render → probe.
8. Give current outputs and digests to an independent `$diagram-project-review` session. That session submits `project-review.mjs <root> <external-review-input>`.
9. After admitted review, run registered `project-release.mjs <root>`. Report only the release manifest and receipt outputs.

Use each wrapper as one exact command. Generated files, evidence, review, release, receipt, and the mutation journal are protected by Hook-issued, short-lived, argv/session/subject-bound capabilities. A Skill load is never required for Hook enforcement.

Static v1 diagrams do not animate. SVG in PowerPoint is vector artwork, not native PowerPoint shape editing.
