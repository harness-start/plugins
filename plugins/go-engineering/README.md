# go-engineering

Orchestrates Go engineering and protects Go module checksums with lightweight source checks.

- Skill: `go-engineering`
- Required community Skills: none
- PreToolUse: domain-owned dependency/generated state
- PostToolUse: bounded syntax/configuration checks
- Config: `.go-engineering.mjs`

Package-manager commands remain allowed when they do not explicitly target a protected path. Live acceptance is Docker-only.
