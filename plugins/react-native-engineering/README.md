# react-native-engineering

Orchestrates bare React Native engineering and protects generated Codegen outputs with bounded configuration checks.

- Skill: `react-native-engineering`
- PreToolUse: domain-owned dependency/generated state
- PostToolUse: bounded syntax/configuration checks
- Config: `.react-native-engineering.mjs`

Package-manager commands remain allowed when they do not explicitly target a protected path. Live acceptance is Docker-only.
