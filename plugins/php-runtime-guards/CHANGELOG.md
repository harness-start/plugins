# Changelog

All notable changes to this plugin are documented in this file.

## [0.1.0] - 2026-08-05

### Added

- Initial release: PHP runtime guards migrated from `infra/harness-starter`
  `php-engineering` hooks.
- PreToolUse (deny): composer.json `repositories` key guard, Chinese unicode
  escape guard, composer.lock write guard, protected generated paths
  (`vendor/`, `.phpunit.result.cache`), all with `blockingContract` recovery
  paths.
- PreToolUse (report): PHP test output truncation guard
  (`phpunit/phpstan/pest/psalm | tail/head -N`).
- PostToolUse (report): `php -l` syntax check, `composer validate`, encoding
  guard (BOM / non-UTF-8 for `.php` / `.twig` / `.blade.php`), net-new debt
  guard (phpstan/psalm suppressions, reflection bypass, empty catches), net-new
  debug statement guard (`dd()` / `var_dump()` / `print_r()` / `dump()`).
- Tests: 61 `node --test` cases (pure unit tests; no subprocess/CLI
  invocations — entry-level smoke tests were dropped by design).
- Docs: README (install/behavior/escapes), DESIGN (decisions), CHANGELOG.

### Not migrated (by design)

- phpstan hooks (lint tracker + Stop aggregation) → future static-analysis
  plugin.
- Laravel / ThinkPHP / Webman env detectors → future per-framework plugins.
- Symfony guards (protected paths, Doctrine entity, Twig) → future Symfony
  plugin.
- `php-env-detector` (UserPromptSubmit context injection) → dropped, deemed
  low value.
