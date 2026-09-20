import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "presentation-visual-critique",
  fullName: "Presentation visual critique",
  description: "Read-only slide hierarchy and typography critique. No writer or release authority.",
  useCases: [
    "Read-only slide hierarchy and typography critique.",
  ],
  constraints: [
    "Stay inside this Skill's documented boundary.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Presentation visual critique\n\nAdvise hierarchy, type, and spacing. Check every used role for point size, line spacing, character spacing, line cap, and CJK/Latin/mixed-script fit on the rendered slide. Cannot write protected slide paths or release.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
