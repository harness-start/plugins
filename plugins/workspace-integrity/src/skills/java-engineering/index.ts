import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "java-engineering",
  fullName: "Java Engineering",
  description: "Build and review Java, Spring Boot, JUnit, and Jakarta changes while preserving build-tool-owned dependency state.",
  useCases: [
    "Build and review Java, Spring Boot, JUnit, and Jakarta changes while preserving build-tool-owned dependency state.",
  ],
  constraints: [
    "Stay inside this Skill's documented boundary.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  frontmatter: { version: "1.0.0" },
  goal: defineSkillGoal({
    body: "Use this Skill for Java, Spring Boot, Maven/Gradle, JUnit 5, or Jakarta migration work. The Hook protects dependency state, validates changed configuration, and reports version-evidenced legacy namespace use.\n\n## Workflow\n\n1. Identify Java, framework, Maven/Gradle, module, and deployment versions before selecting APIs.\n2. Preserve project layering and edit authoritative source or dependency declarations only.\n3. Read [references/practices.md](references/practices.md) for Spring, JUnit, or `javax` to `jakarta` decisions.\n4. Run focused tests and compiler checks before the broader project verification.\n5. Report container, database, integration, or migration boundaries not exercised.\n\nConfigure checks in `.java-engineering.mjs`; use `workspace-integrity-config` for configuration work.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
