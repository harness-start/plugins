# rust-engineering

Orchestrates Rust engineering and protects Cargo.lock with lightweight rustfmt checks.

- Skill: `rust-engineering`
- Required community Skills: `rust-skills`
- PreToolUse: domain-owned dependency/generated state
- PostToolUse: bounded syntax/configuration checks
- Config: `.rust-engineering.mjs`

Package-manager commands remain allowed when they do not explicitly target a protected path. Live acceptance is Docker-only.
