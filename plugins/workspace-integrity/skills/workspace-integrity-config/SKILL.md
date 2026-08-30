---
name: workspace-integrity-config
description: Create, change, or diagnose workspace-integrity project configuration without changing the existing file names or schemas.
disable-model-invocation: true
version: 1.0.0
---
# Workspace Integrity Configuration

Use this explicit-only Skill when the task is specifically to create, edit, or diagnose a workspace-integrity configuration file. Project-owned `.mjs` configuration is trusted executable configuration loaded with `import()`; evaluate it against the documented schema, ordering, and error contract.

## Workflow

1. Resolve the Git root and read the complete existing file plus the plugin README before editing.
2. Preserve the existing file name and unrelated settings. For new files, use the canonical `.mjs` name.
3. Keep path exceptions narrow, ordered, and justified. Do not add universal allow/skip expressions.
4. Validate the JavaScript module, schema values, ordering, and a representative positive and negative case.
5. Report the file, rule/check changes, evaluation order, and verification. Do not claim Hook activation proves the target outcome.

## Supported files

- `.command-safety.mjs`: `rules` plus `settings.engines`. User rules use `RegExp` `match` and `allow`, `deny`, or `report`. An allow does not bypass fixed dangerous-delete or deny-escalation invariants.
- `.engineering-quality.mjs`: language-neutral line-budget `rules`, Markdown `checks`, and ordered `overrides`. Keep language syntax and dependency ownership in domain configuration.
- `.source-integrity.mjs`: source `checks`, ordered `overrides`, and encoding `rules`. Checks use `block`, `report`, or `off`; encoding rules use `block` or `skip`.
- `.android-engineering.mjs`, `.go-engineering.mjs`, `.ios-engineering.mjs`, `.java-engineering.mjs`, `.kubernetes-operations.mjs`, `.nix-engineering.mjs`, `.php-engineering.mjs`, `.python-engineering.mjs`, `.react-native-engineering.mjs`, `.rust-engineering.mjs`, and `.web-frontend-engineering.mjs`: domain `rules`, `checks`, `limits`, and `missingTools` as documented by the README.

Missing or invalid configuration falls back to built-ins and must be surfaced as a diagnostic. Never put commands, callbacks, installation, or network behavior into declarative check schemas unless the documented domain schema explicitly owns it.
