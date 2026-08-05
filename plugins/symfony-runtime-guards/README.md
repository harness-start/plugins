# symfony-runtime-guards

Symfony runtime guards for Claude Code and Codex: protected generated paths,
Doctrine entity mapping heuristics, Twig template syntax checks.

Dual-platform plugin; the same business scripts run on both hosts. Hook
configs are platform-specific (`hooks/claude.json` vs `hooks/hooks.json`).

## Install

```bash
# Claude Code
claude plugin marketplace add <path-to-repo>
claude plugin install symfony-runtime-guards@harness-start

# Codex
codex plugin marketplace add <path-to-repo>
codex plugin add symfony-runtime-guards@harness-start
```

Review and trust the hook definitions before they run. Start a new session to
verify the hooks actually fire.

## Behavior

### PreToolUse (`Edit|Write|MultiEdit|ApplyPatch`)

| Check | Decision | What it blocks |
| --- | --- | --- |
| Protected paths | **deny** | `symfony.lock`, `var/cache/`, `var/log/`, `public/build/`, `public/bundles/`, existing `migrations/Version*.php` |

Deny carries a `blockingContract` (observedFacts / harm / unblockWhen /
recovery) in the reason message.

### PostToolUse (`Edit|Write|MultiEdit|ApplyPatch`)

| Check | Decision | What it reports |
| --- | --- | --- |
| Doctrine entity | report | Non-static properties without an ORM mapping attribute; `ORM\Column type` written as a string literal instead of `Types::` constant (heuristic, `Entity` path only) |
| Twig syntax | report | `bin/console lint:twig` → `twigcs` (project bin, then global) → regex tag-pairing fallback (`{% %}`, `{{ }}`, block/if/for/macro) |

PostToolUse cannot deny on either host; all checks report via
additionalContext.

## Configuration

None. Checks are convention-based and read only the project files. The Twig
check chain degrades gracefully when Symfony console or twigcs are absent.

## Escapes

- Deny messages include the recovery path; fix the target path and retry.
- PostToolUse reports are advisory (Doctrine heuristic by design); verify
  findings locally when in doubt.

## Development

```bash
node --check scripts/*.mjs scripts/checks/*.mjs scripts/lib/*.mjs
node --test tests/*.test.mjs
bash ../../scripts/ci/validate-plugins.sh
```

## Migrated from

`infra/harness-starter` skill `symfony-bundle-boundary-governance` (3 hooks).
The source-side `bin/node:console` typo was fixed to `bin/console` during the
port. Framework env-detectors (Laravel / ThinkPHP / Webman) and the phpstan
family are deliberately not part of this plugin.
