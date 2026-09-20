import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "test-driven-development-orchestrator",
  fullName: "Test-driven development orchestration",
  description: "Orchestrate test-first implementation while the plugin Hook enforces that corresponding tests change before implementation.",
  useCases: [
    "Orchestrate test-first implementation while the plugin Hook enforces that corresponding tests change before implementation.",
  ],
  constraints: [
    "Stay inside this Skill's documented boundary.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Test-driven development orchestration\n\nBefore changing production code, load this plugin's `tdd-red-green` Skill and follow its red-green-refactor loop.\n\nThe Hook injects a short SessionStart reminder, then enforces file order against git HEAD. It does not run tests or judge RED/GREEN. First edit a public-seam test, run it and observe the relevant failure, make the smallest production change, then run it again and observe the relevant pass. Hook permission is not proof that the behavior is correct. Skill load is not a Hook prerequisite.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
