import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "interface-craft-floor",
  fullName: "Interface craft floor",
  description: "Mechanical visual craft floor for interface files. Use immediately before editing UI. Do not use for posters, decks, video, or logos.",
  useCases: [
    "Check the mechanical visual craft floor immediately before editing a web or app interface.",
  ],
  constraints: [
    "Do not use for posters, decks, video, or logos.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Interface craft floor\n\nLoad this after direction is settled. A committed DESIGN.md or brief overrides habit. When the Hook reports a code, act on that finding instead of re-auditing the rule.\n\n## Verify\n\n- Contrast: body and placeholder text ≥4.5:1, large text ≥3:1.\n- Depth: shadows carry an offset and a soft blur. A zero-offset halo is decoration.\n- Spacing: tight groups, generous separation, more space above a heading than below it.\n- Type: set measure by script and viewport: Latin body copy 55–75ch; CJK body copy 24–40 full-width characters; mixed-script interfaces must satisfy both runs at every responsive breakpoint. Use Latin body line-height 1.4–1.7 and CJK body line-height 1.5–1.9. Keep body tracking near normal; reserve wide tracking for short Latin uppercase labels. Display text still caps at 6rem.\n- Motion: one authored moment. Prefer transform and opacity; provide a reduced-motion fallback.\n- Motion mechanics: enumerate transitioned properties; never use `transition: all`. Preserve interruption and exit behavior under rapid repeated input.\n- Focus: removing a native outline requires a visible `:focus-visible` replacement with sufficient contrast.\n- Components: reuse existing tokens and component primitives before adding variants. Keep radius, border, elevation, control height, and icon treatment consistent across the same role.\n- Responsive behavior: verify reflow rather than merely shrinking. Primary actions remain reachable, reading order stays logical, and content does not clip or require unintended horizontal scrolling.\n- States: verify the component state matrix: default, hover, keyboard focus, disabled, loading, error, and empty where applicable. Do not use color as the only state signal.\n\n## Refuse\n\n- Same-size icon + heading + text cards as the page structure.\n- A kicker or eyebrow above a heading.\n- Decorative section numbers (01 / 02 / 03).\n- Gradient text. Emphasis comes from weight or size.\n- Hard offset shadows (`box-shadow: 4px 4px 0`) unless the world is actually neobrutalist.\n- Repeating-linear-gradient grids without a real canvas or map.\n- `transition: all`, which lets unrelated property changes animate accidentally.\n- Removed focus outlines without an equally visible keyboard-focus replacement.\n\nThis Skill cannot write project files, stamp review, or release.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
