---
name: android-engineering
description: Build and review Android projects across Gradle, Compose, tests, resources, and R8 without editing generated dependency state.
version: 1.0.0
---
# Android Engineering

Use this Skill for Android source, build, testing, Compose, resource, or shrinker work. The Hook protects Gradle-owned state, validates changed configuration, and reports bounded source risks; Hook success is not build or device evidence.

## Workflow

1. Identify AGP, Gradle, Kotlin, SDK, modules, variants, and project-owned commands.
2. Preserve the existing architecture and edit authoritative declarations or source only.
3. Read [references/practices.md](references/practices.md) only for the relevant Compose, testing, or R8 section.
4. Run the narrowest relevant unit/static check, then the project build or device acceptance required by the task.
5. Report changed behavior, evidence, and any untested device, signing, or variant boundary.

Configure mechanical checks in `.android-engineering.mjs`; use `workspace-integrity-config` when the task is specifically about configuration.
