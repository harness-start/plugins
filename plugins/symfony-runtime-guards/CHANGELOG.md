# Changelog

All notable changes to this plugin are documented in this file.

## [0.1.0] - 2026-08-05

### Added

- Initial release: Symfony runtime guards migrated from
  `infra/harness-starter` `symfony-bundle-boundary-governance` hooks.
- PreToolUse (deny, blockingContract): protected generated paths
  (`symfony.lock`, `var/cache/`, `var/log/`, `public/build/`,
  `public/bundles/`, existing `migrations/Version*.php`).
- PostToolUse (report): Doctrine entity mapping heuristics (missing ORM
  attributes, string-literal `ORM\Column type`), Twig syntax chain
  (`bin/console lint:twig` → twigcs → regex pairing fallback). Fixed the
  source `bin/node:console` typo.
- Tests: 16 `node --test` cases (pure unit tests; no subprocess/CLI
  invocations).
- Docs: README, DESIGN, CHANGELOG.

### Not migrated (by design)

- Laravel / ThinkPHP / Webman env-detectors → dropped (framework-level
  env-detection deemed low value; confirmed with maintainer).
- phpstan family → future static-analysis plugin.
