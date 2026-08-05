# thinkphp-runtime-guards

ThinkPHP project environment detection for Claude Code and Codex: injects
framework facts into context once per session when a prompt signals a
ThinkPHP project.

Dual-platform plugin; the same business script runs on both hosts. Hook
configs are platform-specific (`hooks/claude.json` vs `hooks/hooks.json`).

## Install

```bash
# Claude Code
claude plugin marketplace add <path-to-repo>
claude plugin install thinkphp-runtime-guards@harness-start

# Codex
codex plugin marketplace add <path-to-repo>
codex plugin add thinkphp-runtime-guards@harness-start
```

Review and trust the hook definitions before they run. Start a new session to
verify the hooks actually fire.

## Behavior

### UserPromptSubmit (prompt matcher: thinkphp / fastadmin / topthink/framework / Application/ / .class.php)

| Signal | Injected facts |
| --- | --- |
| Prompt mentions the framework / project markers | ThinkPHP 版本（topthink/framework）+ legacy（ThinkPHP/Application 目录）与 modern（think/app 入口）布局；composer 元数据不可用时布局探测独立生效 |

Injection happens at most once per session (24h cooldown, keyed by
`sessionId:cwd`, stored under `PLUGIN_DATA` / `CLAUDE_PLUGIN_DATA` /
`~/.harness-start/hook-state`). Question-only prompts without execution
verbs are skipped. All failures are fail-open (silent exit 0).

## Configuration

None. Detection reads `composer.json` (and `.env` APP_ENV for ThinkPHP)
only; no network calls, no writes outside the cooldown state file.

## Development

```bash
node --check scripts/*.mjs scripts/lib/*.mjs
node --test tests/*.test.mjs
bash ../../scripts/ci/validate-plugins.sh
```

## Migrated from

`infra/harness-starter` skill
`thinkphp-maintenance`
(thinkphp-env-detector hook).
