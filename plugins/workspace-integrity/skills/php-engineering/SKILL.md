---
name: php-engineering
description: Build and review PHP applications across common frameworks while preserving Composer-owned dependency state.
version: 1.0.0
---
# PHP Engineering

Use this Skill for PHP, Composer, Symfony, Yii, Laravel, ThinkPHP, Workerman, tests, and static analysis. The Hook protects Composer-owned state and validates changed PHP/configuration files.

## Workflow

1. Identify PHP, framework, Composer, runtime, and deployment versions.
2. Preserve the repository's framework layering and edit source or `composer.json`, never `composer.lock` or `vendor/` directly.
3. Read [references/practices.md](references/practices.md) for framework-neutral boundaries and verification.
4. Run syntax and focused tests before broader static analysis or integration checks.
5. Report database, queue, extension, web-server, and deployment boundaries not exercised.

Configure checks in `.php-engineering.mjs`; use `workspace-integrity-config` for configuration work.
