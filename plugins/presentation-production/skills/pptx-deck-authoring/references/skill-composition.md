# Skill composition

The orchestrator owns all project files, protected outputs, evidence, review admission, and release. External Skills are phase workers without writer, reviewer, or release authority.

| Worker | Source policy | Phase | Allowed contribution | Forbidden contribution |
|---|---|---|---|---|
| MiniMax `pptx-generator` | current upstream | storyboard and source advice | content hierarchy, slide structures, PptxGenJS implementation patterns | running its output writer inside the protected project; producing evidence or receipts |
| Impeccable | current upstream | design-system advice | hierarchy, typography, spacing, color, visual critique | writing project files, generated artifacts, review verdicts, or releases |

Record the actual status in `plan.skill-composition.json`. If an optional worker is unavailable, use the bundled contracts and mark it `unavailable`; do not pretend it ran.

Treat Siril's `presentation-skill` as an unselected candidate. Treat Anthropic's `pptx` Skill as a proprietary reference, not an installable or redistributable dependency of this plugin.

For a delegated worker, provide a scoped brief containing objective, non-goals, allowed input, forbidden writes, required evidence, and a compact result contract. Accept only advice that can be re-expressed in the project-owned storyboard, design system, or TypeScript source.
