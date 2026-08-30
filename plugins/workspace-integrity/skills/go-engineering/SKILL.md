---
name: go-engineering
description: Build and review Go modules while preserving module checksums and using repository-owned formatting, tests, and analysis.
version: 1.0.0
---
# Go Engineering

Use this Skill for Go services, libraries, CLIs, concurrency, tests, and release work. The Hook protects `go.sum` and runs bounded checks; it does not prove behavior.

## Workflow

1. Identify the Go version, module/workspace boundaries, generated code, and project commands.
2. Preserve package ownership and edit source or `go.mod`, never `go.sum` directly.
3. Read [references/practices.md](references/practices.md) for API, errors, concurrency, and testing decisions.
4. Run focused tests and formatting before broader `go test` or project checks.
5. Report race, platform, integration, or release boundaries that were not exercised.

Configure mechanical checks in `.go-engineering.mjs`; use `workspace-integrity-config` for configuration work.
