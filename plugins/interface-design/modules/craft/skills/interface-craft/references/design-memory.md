# Design memory

Design memory turns reusable interface decisions into a project-owned asset. Use it for a new system or material redesign that establishes tokens, component roles, responsive behavior, or motion conventions. Do not create or update it for a local fix, read-only critique, or one-off experiment.

## Carrier and ownership

Use the project-root `DESIGN.md`. Maintain exactly one block with these markers:

```markdown
<!-- interface-craft:system:start -->
...
<!-- interface-craft:system:end -->
```

Preserve everything outside the managed block byte-for-byte. If the file has no block, append the block without rewriting existing prose. If more than one block exists, stop and report the conflict instead of guessing which one owns the system. Never create `.interface-design/system.md` or another competing source of truth.

Start from [the template](design-memory-template.md). Record:

- **Evidence** — facts tied to paths, supplied URLs, screenshots, or observed computed values; inferences that explain the evidence; assumptions that are falsifiable and name how to verify them.
- **Direction** — audience, primary job and action, visual language, hierarchy, layout variance, motion intensity, and information density.
- **Semantic tokens** — roles for color, type, spacing, radius, border, elevation, and motion. Reuse actual project names and values instead of inventing aliases.
- **Component patterns and states** — public primitives, role variants, and the applicable default, hover, focus, active, selected, disabled, loading, error, success, and empty states.
- **Responsive and motion contracts** — reflow, content order, reachable actions, motion purpose, interruption, exit, and reduced-motion behavior.
- **Decisions, exceptions, and verification status** — rationale, narrow exceptions, recovery path, evidence checked, and remaining unverified claims.

Design memory guides later work; it is not a Hook precondition, a review stamp, or completion evidence. Update it only when the implementation actually establishes or changes a reusable decision.
