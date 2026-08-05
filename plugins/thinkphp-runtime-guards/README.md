# thinkphp-runtime-guards

ThinkPHP hard guards for Claude Code and Codex: **deny** writes into
generated / runtime / build paths instead of relying on the model to behave.

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

Review and trust the hook definitions before they run.

## Behavior

### PreToolUse (`Edit|Write|MultiEdit|ApplyPatch`)

| Check | Decision | What it blocks |
| --- | --- | --- |
| Protected paths | **deny** | `runtime/`（ThinkPHP 运行时缓存与日志）、legacy `Application/Runtime/` |

Deny carries a `blockingContract` (observedFacts / harm / unblockWhen /
recovery) in the reason message. Clean runs exit 0 without output.

## Configuration

None. Rules are convention-based path patterns; no state, no network calls.

## Escapes

Deny messages include the recovery path: regenerate via framework commands
(`php artisan` / `npm run build` / delete the runtime directory and let the
framework rebuild) or have the user explicitly confirm the edit.

## Development

```bash
node --check scripts/*.mjs scripts/checks/*.mjs scripts/lib/*.mjs
node --test tests/*.test.mjs
bash ../../scripts/ci/validate-plugins.sh
```

## Origin

New hard-guard plugin (no source-side hook existed in `infra/harness-starter`;
the framework env-detector was removed by maintainer decision). Rule style
follows `php-runtime-guards` / `symfony-runtime-guards` protected-paths
pattern.
