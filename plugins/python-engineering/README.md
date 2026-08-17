# python-engineering

Orchestrates Python engineering and protects package-manager state with lightweight syntax and Ruff checks.

- Skill: `python-engineering`
- PreToolUse: domain-owned dependency/generated state
- PostToolUse: bounded syntax/configuration checks
- Config: `.python-engineering.mjs`

Package-manager commands remain allowed when they do not explicitly target a protected path. Live acceptance is Docker-only.
