---
name: ios-engineering
description: Build and review Swift, SwiftUI, concurrency, and tests while preserving SwiftPM and CocoaPods-owned state.
version: 1.0.0
---
# iOS Engineering

Use this Skill for Swift, UIKit, SwiftUI, concurrency, XCTest, Swift Testing, SwiftPM, or CocoaPods work. The Hook protects dependency state, validates changed files, and reports risky concurrency escapes.

## Workflow

1. Identify the Swift/Xcode deployment targets, package or workspace boundaries, and project commands.
2. Preserve actor isolation, data ownership, navigation, and existing test conventions.
3. Read only the relevant section of [references/practices.md](references/practices.md): SwiftUI, concurrency, or testing.
4. Run the narrowest test or compiler check, then required scheme, simulator, device, or archive acceptance.
5. Report unavailable SDK, signing, runtime, and migration evidence explicitly.

Configure checks in `.ios-engineering.mjs`; use `workspace-integrity-config` for configuration work.
