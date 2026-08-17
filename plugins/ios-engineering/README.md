# ios-engineering

Orchestrates iOS engineering and guards SwiftPM/CocoaPods-owned state with lightweight Swift and plist checks.

- Skill: `ios-engineering`
- Required community Skills: `swiftui-pro`、`swift-concurrency-pro`、`swift-testing-pro`
- PreToolUse: domain-owned dependency/generated state
- PostToolUse: bounded syntax/configuration checks
- Config: `.ios-engineering.mjs`

Package-manager commands remain allowed when they do not explicitly target a protected path. Live acceptance is Docker-only.
