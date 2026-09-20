import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "nix-engineering",
  fullName: "Nix Engineering",
  description: "Build and review Nix, flakes, NixOS, and Home Manager changes while preserving lockfile ownership and reproducibility.",
  useCases: [
    "Build and review Nix, flakes, NixOS, and Home Manager changes while preserving lockfile ownership and reproducibility.",
  ],
  constraints: [
    "Stay inside this Skill's documented boundary.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  frontmatter: { version: "1.0.0" },
  goal: defineSkillGoal({
    body: "Use this Skill for Nix language, flakes, NixOS, Home Manager, and reproducible development environments. The Hook protects `flake.lock` and performs bounded parsing when tools exist.\n\n## Workflow\n\n1. Identify flake boundaries, inputs, target systems, overlays, and repository-owned checks.\n2. Edit Nix declarations, never `flake.lock` directly; use Nix commands for dependency updates.\n3. Read [references/practices.md](references/practices.md) for evaluation and reproducibility guidance.\n4. Run the narrowest parse/evaluation check, then required build or VM/system acceptance.\n5. Report unavailable platforms, substituters, secrets, or deployment evidence.\n\nConfigure checks in `.nix-engineering.mjs`; use `workspace-integrity-config` for configuration work.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
