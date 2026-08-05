# php-runtime-guards

PHP runtime guards for Claude Code and Codex: composer.json policy, protected
generated paths, test output truncation, PHP syntax, encoding, net-new debt
and debug statements.

Dual-platform plugin; the same business scripts run on both hosts. Hook
configs are platform-specific (`hooks/claude.json` vs `hooks/codex.json`)
because event names, matcher syntax and env vars differ.

## Install

```bash
# Claude Code
claude plugin marketplace add <path-to-repo>
claude plugin install php-runtime-guards@harness-start

# Codex
codex plugin marketplace add <path-to-repo>
codex plugin add php-runtime-guards@harness-start
```

Review and trust the hook definitions before they run. Start a new session to
verify the hooks actually fire.

## Behavior

Two hook events, one process each:
### PreToolUse (`Edit|Write|MultiEdit|ApplyPatch|Bash`)

| Check | Decision | What it blocks / reports |
| --- | --- | --- |
| Composer repositories | **deny** | `repositories` key added to a package-level composer.json (write tools, apply_patch added lines, `composer config repositories`, redirects/heredoc) |
| Composer Chinese unicode escapes | **deny** | Chinese text written as JSON `\uXXXX` escapes in composer.json (BMP + surrogate pairs) |
| Composer lockfile | **deny** | Direct writes to composer.lock via write tools or shell (redirect, tee, rm, mv, cp, sed -i) |
| Protected paths | **deny** | `vendor/<pkg>/`, `vendor/autoload.php`, `vendor/composer/`, `.phpunit.result.cache` |
| Test output truncation | report | `phpunit/phpstan/pest/psalm ... | tail/head -N` (N > 1) |

Deny decisions carry a `blockingContract` (observedFacts / harm / unblockWhen /
recovery) in the reason message.

### PostToolUse (`Edit|Write|MultiEdit|ApplyPatch`)

| Check | Decision | What it reports |
| --- | --- | --- |
| php -l | report | Syntax errors (requires `php`; skips when absent) |
| composer validate | report | Invalid composer.json (`--no-check-publish --no-check-lock`; "is valid" passes) |
| Encoding | report | BOM headers and non-UTF-8 byte sequences in `.php` / `.twig` / `.blade.php` |
| Debt | report | Net-new `@phpstan-ignore*` / `@psalm-suppress`, reflection encapsulation bypasses, empty catches (issue/ticket or `-- 原因:` justification exempts) |
| Debug statements | report | Net-new `dd()` (must remove) / `var_dump()` / `print_r()` / `dump()` |

PostToolUse cannot deny on either host; all checks report via
additionalContext. The hard stop gate for PHP quality lives in a separate
static-analysis plugin (phpstan is not part of this plugin).

## Platform notes

- **Claude Code** uses `hooks/claude.json`; **Codex** uses `hooks/hooks.json`
  (Codex's default plugin hook path; matchers match uppercase tool names such
  as `Bash|Write|Edit|ApplyPatch`).
- Codex does **not** auto-trust plugin hooks: a new session asks the user to
  review and trust the hook definitions once before they run. Automated
  invocations can pass `--dangerously-bypass-hook-trust` only when the hook
  source is already vetted.
- Codex non-interactive mode applies file patches through the Bash tool with
  an inline `*** Begin Patch` payload; the PostToolUse entry extracts the
  patch targets (`scripts/lib/patch-utils.mjs`) so checks still run.

## Configuration

None. All checks are convention-based and read only the project files and git
HEAD baselines. Files under `tests/`, `spec/`, `fixtures/`, `vendor/` etc. are
skipped by the debt / debug net-new checks (source semantics).

## Escapes

- Deny messages include the recovery path; fix the composer.json / target path
  and retry.
- PostToolUse reports are advisory; verify findings locally when in doubt.

## Development

```bash
node --check scripts/php-hook-pre-tool.mjs scripts/php-hook-post-tool.mjs
node --test tests/*.test.mjs
bash ../../scripts/ci/validate-plugins.sh
```

## Migrated from

`infra/harness-starter` skills `php-engineering` (composer guards, protected
paths, truncation, syntax, encoding, debt, debug) — framework-specific
detectors (Laravel / ThinkPHP / Webman), phpstan and Symfony guards stay in
the source repo for later dedicated plugins.
