import {
  InvocationPolicy,
  defineSkill,
  defineSkillGoal,
} from "../../../../../core/skill/define.ts";

export default defineSkill({
  id: "ios-engineering",
  fullName: "iOS Engineering",
  description: "Build and review Swift, SwiftUI, concurrency, and tests while preserving SwiftPM and CocoaPods-owned state.",
  useCases: [
    "Build and review Swift, SwiftUI, concurrency, and tests while preserving SwiftPM and CocoaPods-owned state.",
  ],
  constraints: [
    "Stay inside this Skill's documented boundary.",
  ],
  invocation: InvocationPolicy.ImplicitAndExplicit,
  frontmatter: { version: "1.0.0" },
  goal: defineSkillGoal({
    body: "Use this Skill for Swift, UIKit, SwiftUI, concurrency, XCTest, Swift Testing, SwiftPM, or CocoaPods work. The Hook protects dependency state, validates changed files, and reports risky concurrency escapes.\n\n## Workflow\n\n1. Identify the Swift/Xcode deployment targets, package or workspace boundaries, and project commands.\n2. Preserve actor isolation, data ownership, navigation, and existing test conventions.\n3. Read only the relevant section of [references/practices.md](references/practices.md): SwiftUI, concurrency, or testing.\n4. Run the narrowest test or compiler check, then required scheme, simulator, device, or archive acceptance.\n5. Report unavailable SDK, signing, runtime, and migration evidence explicitly.\n\nConfigure checks in `.ios-engineering.mjs`; use `workspace-integrity-config` for configuration work.\n",
  }),
  sourceDir: new URL("./", import.meta.url),
});
