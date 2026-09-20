import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "python-engineering",
  fullName: "Python Engineering",
  description: "Build and review Python packages, services, tests, typing, and async code while preserving package-manager-owned state.",
  useCases: [
    "Build and review Python packages, services, tests, typing, and async code while preserving package-manager-owned state.",
  ],
  constraints: [
    "Stay inside this Skill's documented boundary.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  frontmatter: { version: "1.0.0" },
  goal: defineSkillGoal({
    body: "Use this Skill for Python packages, services, CLIs, typing, async code, and tests. The Hook protects package-manager state and runs bounded syntax, JSON, and Ruff checks.\n\n## Workflow\n\n1. Identify Python, package manager, environment, framework, type checker, and test runner versions.\n2. Preserve project architecture and edit source or authoritative dependency declarations only.\n3. Read [references/practices.md](references/practices.md) for packaging, API, async, and testing choices.\n4. Run the narrowest test/type/lint check before broader project verification.\n5. Report native extension, service, database, platform, and packaging boundaries not exercised.\n\nConfigure checks in `.python-engineering.mjs`; use `workspace-integrity-config` for configuration work.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
