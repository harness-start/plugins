import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "language-output-config",
  fullName: "language-output-config",
  description: "Change language-output defaults: response and artifact profiles, drift thresholds, tool feedback, and Stop language gate in .language-output.mjs.",
  useCases: [
    "Change language-output defaults: response and artifact profiles, drift thresholds, tool feedback, and Stop language gate in .language-output.mjs.",
  ],
  constraints: [
    "Do not add custom callbacks, arbitrary profiles, path overrides, turn-level language state, or compatibility reads from `in-chinese`.",
  ],
  invocation: InvocationPolicy.ExplicitOnly,
  frontmatter: { version: "0.3.0" },
  goal: defineSkillGoal({
    body: "# language-output-config\n\nManage the Git-root `.language-output.mjs` consumed by `language-output`. Read `../../README.md` before changing the interface.\n\n## Workflow\n\n1. Resolve the root with `git rev-parse --show-toplevel` and read an existing configuration in full.\n2. Select one built-in `defaultProfile` for responses: `zh-CN`, `zh-TW`, `en-US`, `ja-JP`, `ko-KR`, or `th-TH`.\n3. Set `artifactProfile` only when generated files have a stable language contract that differs from responses. Explicit user and project-owned artifact requirements take precedence.\n4. Keep `toolFeedback: \"report\"` and `stop: \"block\"` unless the user explicitly requests a narrower policy.\n5. Keep detection thresholds at `12` characters and `0.25` ratio unless observed false positives justify a bounded change.\n6. Run the plugin unit tests after schema-sensitive changes.\n\nDo not add custom callbacks, arbitrary profiles, path overrides, turn-level language state, or compatibility reads from `in-chinese`.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
