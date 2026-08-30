---
name: python-engineering
description: Build and review Python packages, services, tests, typing, and async code while preserving package-manager-owned state.
version: 1.0.0
---
# Python Engineering

Use this Skill for Python packages, services, CLIs, typing, async code, and tests. The Hook protects package-manager state and runs bounded syntax, JSON, and Ruff checks.

## Workflow

1. Identify Python, package manager, environment, framework, type checker, and test runner versions.
2. Preserve project architecture and edit source or authoritative dependency declarations only.
3. Read [references/practices.md](references/practices.md) for packaging, API, async, and testing choices.
4. Run the narrowest test/type/lint check before broader project verification.
5. Report native extension, service, database, platform, and packaging boundaries not exercised.

Configure checks in `.python-engineering.mjs`; use `workspace-integrity-config` for configuration work.
