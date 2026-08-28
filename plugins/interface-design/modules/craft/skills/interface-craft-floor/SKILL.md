---
name: interface-craft-floor
description: Mechanical visual craft floor for interface files. Use immediately before editing UI. Do not use for posters, decks, video, or logos.
---

# Interface craft floor

Load this after direction is settled. A committed DESIGN.md or brief overrides habit. When the Hook reports a code, act on that finding instead of re-auditing the rule.

## Verify

- Contrast: body and placeholder text ≥4.5:1, large text ≥3:1.
- Depth: shadows carry an offset and a soft blur. A zero-offset halo is decoration.
- Spacing: tight groups, generous separation, more space above a heading than below it.
- Type: set measure by script and viewport: Latin body copy 55–75ch; CJK body copy 24–40 full-width characters; mixed-script interfaces must satisfy both runs at every responsive breakpoint. Use Latin body line-height 1.4–1.7 and CJK body line-height 1.5–1.9. Keep body tracking near normal; reserve wide tracking for short Latin uppercase labels. Display text still caps at 6rem.
- Motion: one authored moment. Prefer transform and opacity; provide a reduced-motion fallback.
- Motion mechanics: enumerate transitioned properties; never use `transition: all`. Preserve interruption and exit behavior under rapid repeated input.
- Focus: removing a native outline requires a visible `:focus-visible` replacement with sufficient contrast.
- Components: reuse existing tokens and component primitives before adding variants. Keep radius, border, elevation, control height, and icon treatment consistent across the same role.
- Responsive behavior: verify reflow rather than merely shrinking. Primary actions remain reachable, reading order stays logical, and content does not clip or require unintended horizontal scrolling.
- States: verify the component state matrix: default, hover, keyboard focus, disabled, loading, error, and empty where applicable. Do not use color as the only state signal.

## Refuse

- Same-size icon + heading + text cards as the page structure.
- A kicker or eyebrow above a heading.
- Decorative section numbers (01 / 02 / 03).
- Gradient text. Emphasis comes from weight or size.
- Hard offset shadows (`box-shadow: 4px 4px 0`) unless the world is actually neobrutalist.
- Repeating-linear-gradient grids without a real canvas or map.
- `transition: all`, which lets unrelated property changes animate accidentally.
- Removed focus outlines without an equally visible keyboard-focus replacement.

This Skill cannot write project files, stamp review, or release.
