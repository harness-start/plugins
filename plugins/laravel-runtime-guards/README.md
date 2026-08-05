# laravel-runtime-guards

Laravel project environment detection for Claude Code and Codex: injects
framework facts into context once per session when a prompt signals a
Laravel project.

Dual-platform plugin; the same business script runs on both hosts. Hook
configs are platform-specific (`hooks/claude.json` vs `hooks/hooks.json`).

## Install

```bash
# Claude Code
claude plugin marketplace add <path-to-repo>
claude plugin install laravel-runtime-guards@harness-start

# Codex
codex plugin marketplace add <path-to-repo>
codex plugin add laravel-runtime-guards@harness-start
```

Review and trust the hook definitions before they run. Start a new session to
verify the hooks actually fire.

## Behavior

### UserPromptSubmit (prompt matcher: Laravel / artisan / composer.json / Blade / Pest)

| Signal | Injected facts |
| --- | --- |
| Prompt mentions the framework / project markers | Laravel 版本、PHP 约束、artisan、关键包（Sanctum/Horizon/Nova/Octane/Livewire/Inertia/Cashier/Scout）、测试框架（Pest/PHPUnit）、APP_ENV（仅此一个 .env 值，避免注入凭据） |

Injection happens at most once per session (24h cooldown, keyed by
`sessionId:cwd`, stored under `PLUGIN_DATA` / `CLAUDE_PLUGIN_DATA` /
`~/.harness-start/hook-state`). Question-only prompts without execution
verbs are skipped. All failures are fail-open (silent exit 0).

## Configuration

None. Detection reads `composer.json` (and `.env` APP_ENV for Laravel)
only; no network calls, no writes outside the cooldown state file.

## Development

```bash
node --check scripts/*.mjs scripts/lib/*.mjs
node --test tests/*.test.mjs
bash ../../scripts/ci/validate-plugins.sh
```

## Migrated from

`infra/harness-starter` skill
`laravel-patterns`
(laravel-env-detector hook).
