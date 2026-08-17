# Changelog

## 0.3.0

- Keep only cross-stack file line budgets and Markdown structure checks.
- Move language syntax, lint, Composer validation, dependency-file protection, and delayed PHPStan ownership to the corresponding engineering domain plugins.
- Remove the Stop hook and language-check state directory.

## 0.2.0

- Store session JSON under `.engineering-quality/state/` and place the matching `.gitignore` at `.engineering-quality/.gitignore`.

## 0.1.0

- Add bounded post-write syntax and lint checks for JavaScript, TypeScript, Python, and PHP.
- Add session-batched PHPStan checks at Stop with workspace-local state.
- Add project-root modes, path overrides, resource limits, offline tests, and dual-host acceptance coverage.
