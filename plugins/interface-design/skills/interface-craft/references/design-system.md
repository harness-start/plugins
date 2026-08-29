# Design-system continuity

Use this reference when adding to or repairing an existing product.

## Inventory first

Inspect existing semantic tokens, theme configuration, shared components, icon sets, layout primitives, and representative screens before introducing values. Prefer the system's public component API to copying its internal styles.

## Extend deliberately

- Map color, type, spacing, radius, border, elevation, and motion to semantic roles.
- Reuse existing component primitives and composition patterns. Add a variant only when the same meaning recurs and no current variant expresses it.
- Define the relevant state matrix: default, hover, focus, active, selected, disabled, loading, error, success, and empty. Preserve non-color cues and keyboard focus.
- Check desktop and mobile behavior against the product's existing breakpoints and content order.
- Preserve the communication core across routes and states. Reuse the signature cue through a named component, state, or surface role; do not reduce continuity to repeating a color, logo, or decorative shape.
- When the product promise changes, revise the retell target and semantic link explicitly. When it does not, treat the core invariants and prohibited drift as compatibility constraints.
- Record an exception when the requested outcome genuinely cannot fit the current system; keep it narrow and explain the migration or recovery path.
- When a new decision will be reused across surfaces, update the managed block described in [Design memory](design-memory.md). Do not create a second hidden system file.

Continuity is not visual sameness. It means new decisions are traceable to existing roles or to an explicit, bounded exception.
