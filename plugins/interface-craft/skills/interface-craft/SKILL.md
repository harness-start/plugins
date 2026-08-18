---
name: interface-craft
description: Orchestrate general interface visual craft. Use when designing, reviewing, or repairing web or app UI direction, design-system continuity, hierarchy, contrast, type, spacing, motion, or anti-patterns. Do not use for posters, PPTX, Remotion, logos, or language/lockfile engineering.
---

# Interface craft

This Skill is the only entry. Load same-plugin companions and the references below only when their decision is active; never load community `impeccable` or `vendor-skills`.

## Route

1. Inspect the project's existing tokens, components, brand assets, screenshots, and `DESIGN.md` before choosing a direction. Preserve established decisions unless the request explicitly calls for a redesign.
2. For a new surface or material redesign, read [Visual direction](references/visual-direction.md). When extending an existing product, read [Design-system continuity](references/design-system.md). Read [Motion](references/motion.md) only when transitions, feedback, or authored movement matter.
3. Read `$interface-craft-floor` immediately before editing UI. For a read-only review, read `$interface-visual-critique` instead.
4. After edits, render the interface at representative desktop and mobile viewports, or inspect current screenshots when a renderer is already available. Critique the rendered result for hierarchy, clipping, responsive reflow, component consistency, and states; then make one bounded correction pass. If rendering is unavailable, say which visual claims remain unverified.
5. Honor Hook findings. Mechanical codes (`HARD_OFFSET_SHADOW`, `GRADIENT_TEXT`, `EYEBROW_KICKER`, `SECTION_NUMBER_DECORATION`, `REPEATING_GRID_BACKGROUND`) are facts about the current file. Direction and taste judgments stay in the Skill workflow.

## Honest limits

- This plugin does not write poster, deck, Remotion, or logo artifacts.
- It does not protect lockfiles or replace `web-frontend-engineering` syntax gates.
- Parse errors and non-UI files fail open. Hook activation, source conformance, or a successful screenshot alone is not proof the interface is good.
