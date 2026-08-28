# Skill composition

The orchestrator owns all project files, protected outputs, evidence, review admission, and release. Bundled first-party Skills are phase workers without writer, reviewer, or release authority.

| Worker | Source policy | Phase | Allowed contribution | Forbidden contribution |
|---|---|---|---|---|
| `presentation-storyboard` | bundled first-party | storyboard and source advice | content hierarchy, slide structures, PptxGenJS implementation patterns | running an output writer inside the protected project; producing evidence or receipts |
| `presentation-visual-critique` | bundled first-party | design-system advice | hierarchy, typography, spacing, color, visual critique | writing project files, generated artifacts, review verdicts, or releases |

Record the actual status in `plan.skill-composition.json`. If an optional worker is unused, mark it `skipped`; do not pretend it ran.

For a delegated worker, provide a scoped brief containing objective, non-goals, allowed input, forbidden writes, required evidence, and a compact result contract. Accept only advice that can be re-expressed in the project-owned storyboard, design system, or TypeScript source.
