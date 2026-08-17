# java-engineering

Orchestrates Java and Spring Boot engineering and guards Gradle-owned dependency state.

- Skill: `java-engineering`
- PreToolUse: domain-owned dependency/generated state
- PostToolUse: bounded syntax/configuration checks
- Config: `.java-engineering.mjs`

Package-manager commands remain allowed when they do not explicitly target a protected path. Live acceptance is Docker-only.
