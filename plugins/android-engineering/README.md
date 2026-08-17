# android-engineering

Orchestrates Android engineering and guards Gradle-owned dependency state with lightweight Android configuration checks.

- Skill: `android-engineering`
- Required community Skills: `testing-setup`、`r8-analyzer`、`compose-agent`
- PreToolUse: domain-owned dependency/generated state
- PostToolUse: bounded syntax/configuration checks
- Config: `.android-engineering.mjs`

Package-manager commands remain allowed when they do not explicitly target a protected path. Live acceptance is Docker-only.
