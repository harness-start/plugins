# android-engineering

Orchestrates Android engineering and guards Gradle-owned dependency state with lightweight Android configuration checks.

- Skill: `android-engineering`
- PreToolUse: domain-owned dependency/generated state
- PostToolUse: bounded syntax/configuration checks, plus report-only Compose source scans on `.kt` / `.kts`
- Config: `.android-engineering.mjs`

Compose scans look for `collectAsState()`, boxed `mutableStateOf` of Int/Long/Float/Double, and `color`/`tint` literals of `Color.Black`, `Color.White`, or `Color(0x…)` in a file that already reads `colorScheme`. Defaults are `report`; set `checks.composeCollectAsState`, `checks.composePrimitiveState`, or `checks.composeLiteralColor` to `off` or `block` in `.android-engineering.mjs`. A reported finding is not proof that Compose behavior is correct.

Package-manager commands remain allowed when they do not explicitly target a protected path. Live acceptance is Docker-only.
