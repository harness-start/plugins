# nix-engineering

Orchestrates Nix engineering and protects flake.lock with lightweight Nix parsing.

- Skill: `nix-engineering`
- Required community Skills: none
- PreToolUse: domain-owned dependency/generated state
- PostToolUse: bounded syntax/configuration checks
- Config: `.nix-engineering.mjs`

Package-manager commands remain allowed when they do not explicitly target a protected path. Live acceptance is Docker-only.
