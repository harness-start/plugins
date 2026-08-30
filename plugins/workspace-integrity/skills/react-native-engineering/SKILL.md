---
name: react-native-engineering
description: Build and review bare React Native apps across performance, navigation, upgrades, Codegen, and native boundaries.
version: 1.0.0
---
# React Native Engineering

Use this Skill for bare React Native, Metro, navigation, performance, upgrades, autolinking, Codegen, and native module boundaries. The Hook protects generated/package-manager state and validates bounded configuration changes.

## Workflow

1. Identify React Native, React, Node, package manager, iOS, Android, and architecture versions.
2. Preserve ownership across JavaScript, native platforms, Codegen, and generated outputs.
3. Read only the relevant section of [references/practices.md](references/practices.md): performance, navigation, native modules, or upgrades.
4. Run focused tests and type checks, then required platform build and device/emulator acceptance.
5. Report platform, architecture, release, or data-plane evidence not exercised.

Configure checks in `.react-native-engineering.mjs`; use `workspace-integrity-config` for configuration work.
