import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "react-native-engineering",
  fullName: "React Native Engineering",
  description: "Build and review bare React Native apps across performance, navigation, upgrades, Codegen, and native boundaries.",
  useCases: [
    "Build and review bare React Native apps across performance, navigation, upgrades, Codegen, and native boundaries.",
  ],
  constraints: [
    "Stay inside this Skill's documented boundary.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  frontmatter: { version: "1.0.0" },
  goal: defineSkillGoal({
    body: "Use this Skill for bare React Native, Metro, navigation, performance, upgrades, autolinking, Codegen, and native module boundaries. The Hook protects generated/package-manager state and validates bounded configuration changes.\n\n## Workflow\n\n1. Identify React Native, React, Node, package manager, iOS, Android, and architecture versions.\n2. Preserve ownership across JavaScript, native platforms, Codegen, and generated outputs.\n3. Read only the relevant section of [references/practices.md](references/practices.md): performance, navigation, native modules, or upgrades.\n4. Run focused tests and type checks, then required platform build and device/emulator acceptance.\n5. Report platform, architecture, release, or data-plane evidence not exercised.\n\nConfigure checks in `.react-native-engineering.mjs`; use `workspace-integrity-config` for configuration work.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
