import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "android-engineering",
  fullName: "Android Engineering",
  description: "Build and review Android projects across Gradle, Compose, tests, resources, and R8 without editing generated dependency state.",
  useCases: [
    "Build and review Android projects across Gradle, Compose, tests, resources, and R8 without editing generated dependency state.",
  ],
  constraints: [
    "Stay inside this Skill's documented boundary.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  frontmatter: { version: "1.0.0" },
  goal: defineSkillGoal({
    body: "Use this Skill for Android source, build, testing, Compose, resource, or shrinker work. The Hook protects Gradle-owned state, validates changed configuration, and reports bounded source risks; Hook success is not build or device evidence.\n\n## Workflow\n\n1. Identify AGP, Gradle, Kotlin, SDK, modules, variants, and project-owned commands.\n2. Preserve the existing architecture and edit authoritative declarations or source only.\n3. Read [references/practices.md](references/practices.md) only for the relevant Compose, testing, or R8 section.\n4. Run the narrowest relevant unit/static check, then the project build or device acceptance required by the task.\n5. Report changed behavior, evidence, and any untested device, signing, or variant boundary.\n\nConfigure mechanical checks in `.android-engineering.mjs`; use `workspace-integrity-config` when the task is specifically about configuration.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
