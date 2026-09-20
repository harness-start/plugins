import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "git-delivery-config",
  fullName: "git-delivery-config",
  description: "Change git-delivery project settings or commit boundary rules via .git-delivery.mjs and commit-boundaries.json.",
  useCases: [
    "Change git-delivery project settings or commit boundary rules via .git-delivery.mjs and commit-boundaries.json.",
  ],
  constraints: [
    "Do not add callbacks, custom scanners, command-rule opt-outs, remote-host settings, or reads from another plugin's configuration.",
  ],
  invocation: InvocationPolicy.ExplicitOnly,
  frontmatter: { version: "0.3.0" },
  goal: defineSkillGoal({
    body: "# git-delivery-config\n\nManage the Git-root `.git-delivery.mjs` and `.ai-experts/commit-boundaries.json` consumed by `git-delivery`. Read `../../README.md` before changing either interface.\n\n## Workflow\n\n1. Resolve the root with `git rev-parse --show-toplevel` and read an existing configuration in full.\n2. Use `.git-delivery.mjs` for `mergeConflict` modes, ordered path overrides, and repo-wide `worktreeCreate`.\n3. Keep `worktreeCreate` at `block` unless the repository has chosen to allow linked worktrees. Valid values are `block`, `report`, and `allow`.\n4. Use `.ai-experts/commit-boundaries.json` only to group paths that may form one atomic commit boundary.\n5. Keep `mergeConflict` `block` as the default. Make `report` or `off` exceptions narrow and evidence-backed.\n6. Run the plugin unit tests after schema-sensitive changes.\n\nDo not add callbacks, custom scanners, command-rule opt-outs, remote-host settings, or reads from another plugin's configuration.\nDo not treat `worktreeCreate: \"allow\"` as a way to bypass other Git delivery rules.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
