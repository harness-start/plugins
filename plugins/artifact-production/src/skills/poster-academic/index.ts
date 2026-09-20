import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "poster-academic",
  fullName: "Academic poster narrative",
  description: "Read-only academic poster narrative and scanability advice. No writer or release authority.",
  useCases: [
    "Read-only academic poster narrative and scanability advice.",
  ],
  constraints: [
    "Do not copy conference assets or run network scripts.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Academic poster narrative\n\nAdvise scanability, claim hierarchy, and figure-first reading. Do not copy conference assets or run network scripts. No writer, review, or release authority.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
