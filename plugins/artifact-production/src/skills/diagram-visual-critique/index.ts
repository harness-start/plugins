import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "diagram-visual-critique",
  fullName: "Diagram Visual Critique",
  description: "Read-only visual and semantic critique for an existing diagram image or current diagram project output. Use to assess hierarchy, density, routing, labels, accessibility, and type fitness; do not use to write, render, review-sign, or release a diagram project.",
  useCases: [
    "Read-only visual and semantic critique for an existing diagram image or current diagram project output.",
  ],
  constraints: [
    "do not use to write, render, review-sign, or release a diagram project.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Diagram Visual Critique\n\nThis adviser is read-only and has no writer authority. Inspect the current SVG/PNG at full size and thumbnail size, then return anchored findings with severity, evidence, and a falsifiable recovery step.\n\nCheck type fitness, title-to-takeaway alignment, reading order, node hierarchy, group boundaries, connector crossings, label collisions, edge ambiguity, density, whitespace, contrast, non-color encoding, CJK/Latin typography, and whether decoration competes with meaning. Prefer removing structure or labels before shrinking text. Treat a clean render as insufficient when the intended relationship remains unclear.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
