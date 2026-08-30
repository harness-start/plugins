---
name: java-engineering
description: Build and review Java, Spring Boot, JUnit, and Jakarta changes while preserving build-tool-owned dependency state.
version: 1.0.0
---
# Java Engineering

Use this Skill for Java, Spring Boot, Maven/Gradle, JUnit 5, or Jakarta migration work. The Hook protects dependency state, validates changed configuration, and reports version-evidenced legacy namespace use.

## Workflow

1. Identify Java, framework, Maven/Gradle, module, and deployment versions before selecting APIs.
2. Preserve project layering and edit authoritative source or dependency declarations only.
3. Read [references/practices.md](references/practices.md) for Spring, JUnit, or `javax` to `jakarta` decisions.
4. Run focused tests and compiler checks before the broader project verification.
5. Report container, database, integration, or migration boundaries not exercised.

Configure checks in `.java-engineering.mjs`; use `workspace-integrity-config` for configuration work.
