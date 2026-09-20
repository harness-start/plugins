import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "go-engineering",
  fullName: "Go Engineering",
  description: "Build and review Go modules while preserving module checksums and using repository-owned formatting, tests, and analysis.",
  useCases: [
    "Build and review Go modules while preserving module checksums and using repository-owned formatting, tests, and analysis.",
  ],
  constraints: [
    "Stay inside this Skill's documented boundary.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  frontmatter: { version: "1.0.0" },
  goal: defineSkillGoal({
    body: "Use this Skill for Go services, libraries, CLIs, concurrency, tests, and release work. The Hook protects `go.sum` and runs bounded checks; it does not prove behavior.\n\n## Workflow\n\n1. Identify the Go version, module/workspace boundaries, generated code, and project commands.\n2. Preserve package ownership and edit source or `go.mod`, never `go.sum` directly.\n3. Read [references/practices.md](references/practices.md) for API, errors, concurrency, and testing decisions.\n4. Run focused tests and formatting before broader `go test` or project checks.\n5. Report race, platform, integration, or release boundaries that were not exercised.\n\nConfigure mechanical checks in `.go-engineering.mjs`; use `workspace-integrity-config` for configuration work.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
