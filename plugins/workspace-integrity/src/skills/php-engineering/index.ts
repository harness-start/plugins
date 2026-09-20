import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "php-engineering",
  fullName: "PHP Engineering",
  description: "Build and review PHP applications across common frameworks while preserving Composer-owned dependency state.",
  useCases: [
    "Build and review PHP applications across common frameworks while preserving Composer-owned dependency state.",
  ],
  constraints: [
    "Stay inside this Skill's documented boundary.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  frontmatter: { version: "1.0.0" },
  goal: defineSkillGoal({
    body: "Use this Skill for PHP, Composer, Symfony, Yii, Laravel, ThinkPHP, Workerman, tests, and static analysis. The Hook protects Composer-owned state and validates changed PHP/configuration files.\n\n## Workflow\n\n1. Identify PHP, framework, Composer, runtime, and deployment versions.\n2. Preserve the repository's framework layering and edit source or `composer.json`, never `composer.lock` or `vendor/` directly.\n3. Read [references/practices.md](references/practices.md) for framework-neutral boundaries and verification.\n4. Run syntax and focused tests before broader static analysis or integration checks.\n5. Report database, queue, extension, web-server, and deployment boundaries not exercised.\n\nConfigure checks in `.php-engineering.mjs`; use `workspace-integrity-config` for configuration work.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
