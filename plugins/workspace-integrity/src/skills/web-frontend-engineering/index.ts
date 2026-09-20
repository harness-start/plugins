import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "web-frontend-engineering",
  fullName: "Web Frontend Engineering",
  description: "Build and review React, Vue, Angular, and TypeScript projects while preserving package-manager-owned state.",
  useCases: [
    "Build and review React, Vue, Angular, and TypeScript projects while preserving package-manager-owned state.",
  ],
  constraints: [
    "Stay inside this Skill's documented boundary.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  frontmatter: { version: "1.0.0" },
  goal: defineSkillGoal({
    body: "Use this Skill for React, Vue, Angular, TypeScript, testing, accessibility, rendering, and frontend performance. The Hook protects package-manager state and validates bounded JavaScript, TypeScript, and configuration changes.\n\n## Workflow\n\n1. Identify framework, runtime, package manager, rendering mode, router, state, and test versions.\n2. Preserve project component and data-flow conventions; edit source or authoritative dependency declarations only.\n3. Read only the relevant React, Vue, Angular, testing, or performance section in [references/practices.md](references/practices.md).\n4. Run focused tests, type checks, and lint before required browser/build acceptance.\n5. Report browser, accessibility, hydration, bundle, and deployment evidence not exercised.\n\nConfigure checks in `.web-frontend-engineering.mjs`; use `workspace-integrity-config` for configuration work.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
