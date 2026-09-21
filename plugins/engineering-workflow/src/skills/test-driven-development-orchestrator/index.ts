import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "test-driven-development-orchestrator",
  fullName: "Test-driven development orchestration",
  description: "Orchestrate test-first implementation with observed RED and GREEN evidence while the plugin Hook provides an advisory reminder.",
  useCases: [
    "Orchestrate test-first implementation with observed RED and GREEN evidence.",
  ],
  constraints: [
    "Stay inside this Skill's documented boundary.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  goal: defineSkillGoal({
    body: "# Test-driven development orchestration\n\nBefore changing production code, load this plugin's `tdd-red-green` Skill and follow its red-green-refactor loop.\n\nThe Hook injects a short SessionStart reminder. It does not enforce file order, infer correspondence between tests and implementation, run tests, or judge RED/GREEN. First edit a public-seam test, run it and observe the relevant failure, make the smallest production change, then run it again and observe the relevant pass. The observed test results are the evidence. Skill load is not a Hook prerequisite.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
