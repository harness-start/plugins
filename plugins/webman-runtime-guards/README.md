# webman-runtime-guards

Webman project environment detection for Claude Code and Codex: injects
framework facts into context once per session when a prompt signals a
Webman project.

Dual-platform plugin; the same business script runs on both hosts. Hook
configs are platform-specific (`hooks/claude.json` vs `hooks/hooks.json`).

## Install

```bash
# Claude Code
claude plugin marketplace add <path-to-repo>
claude plugin install webman-runtime-guards@harness-start

# Codex
codex plugin marketplace add <path-to-repo>
codex plugin add webman-runtime-guards@harness-start
```

Review and trust the hook definitions before they run. Start a new session to
verify the hooks actually fire.

## Behavior

### UserPromptSubmit (prompt matcher: webman / workerman)

| Signal | Injected facts |
| --- | --- |
| Prompt mentions the framework / project markers | Webman 版本（workerman/webman-framework 或 webman/framework）、Workerman 版本、PHP 约束、项目名、webman/* 扩展、关键依赖（illuminate/database、ThinkORM、phpdotenv、Twig、Blade） |

Injection happens at most once per session (24h cooldown, keyed by
`sessionId:cwd`, stored under `PLUGIN_DATA` / `CLAUDE_PLUGIN_DATA` /
`~/.harness-start/hook-state`). Question-only prompts without execution
verbs are skipped. All failures are fail-open (silent exit 0).

## Configuration

None. Detection reads `composer.json` (and `.env` APP_ENV for Webman)
only; no network calls, no writes outside the cooldown state file.

## Development

```bash
node --check scripts/*.mjs scripts/lib/*.mjs
node --test tests/*.test.mjs
bash ../../scripts/ci/validate-plugins.sh
```

## Migrated from

`infra/harness-starter` skill
`php-async-worker-runtime-patterns`
(webman-env-detector hook).
