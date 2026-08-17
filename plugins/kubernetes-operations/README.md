# kubernetes-operations

Orchestrates Kubernetes operations and guards Helm-owned dependency state with bounded manifest validation.

- Skill: `kubernetes-operations`
- PreToolUse: domain-owned dependency/generated state
- PostToolUse: bounded syntax/configuration checks
- Config: `.kubernetes-operations.mjs`

Package-manager commands remain allowed when they do not explicitly target a protected path. Live acceptance is Docker-only.
