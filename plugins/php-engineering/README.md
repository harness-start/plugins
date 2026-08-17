# php-engineering

Orchestrates mixed-framework PHP engineering and protects Composer-owned state with lightweight PHP checks.

- Skill: `php-engineering`
- PreToolUse: domain-owned dependency/generated state
- PostToolUse: bounded syntax/configuration checks
- Config: `.php-engineering.mjs`

Package-manager commands remain allowed when they do not explicitly target a protected path. Live acceptance is Docker-only.
