import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "rust-engineering",
  fullName: "Rust Engineering",
  description: "Build and review Rust crates across ownership, APIs, async, unsafe code, testing, and performance while preserving Cargo state.",
  useCases: [
    "Build and review Rust crates across ownership, APIs, async, unsafe code, testing, and performance while preserving Cargo state.",
  ],
  constraints: [
    "Stay inside this Skill's documented boundary.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  frontmatter: { version: "1.0.0" },
  goal: defineSkillGoal({
    body: "Use this Skill for Cargo, ownership, APIs, errors, async/concurrency, unsafe code, testing, and performance. The Hook protects `Cargo.lock`, runs bounded formatting, and reports unexplained unsafe regions.\n\n## Workflow\n\n1. Identify Rust edition, MSRV, workspace/crate boundaries, targets, features, and project checks.\n2. Preserve ownership and public API compatibility; edit source or `Cargo.toml`, never `Cargo.lock` directly.\n3. Read the relevant category in [references/practices.md](references/practices.md) instead of loading a rule encyclopedia.\n4. Run focused tests and formatting before broader feature, target, Clippy, Miri, or benchmark checks.\n5. Report target, feature, unsafe-invariant, and performance evidence not exercised.\n\nConfigure checks in `.rust-engineering.mjs`; use `workspace-integrity-config` for configuration work.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
