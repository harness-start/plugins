# symfony-runtime-guards DESIGN

Design decisions for the symfony-runtime-guards plugin (0.1.0).

## Scope

Migrated from `infra/harness-starter` `symfony-bundle-boundary-governance`
(3 hooks): protected paths, Doctrine entity heuristics, Twig syntax.

Excluded deliberately (confirmed with maintainer):

- Framework env-detectors (Laravel / ThinkPHP / Webman) → dropped; the same
  rationale that removed `php-env-detector` applies (low value, context
  budget cost).
- phpstan family → future dedicated static-analysis plugin.

## Event mapping

| Source event | Target platform event | Checks |
| --- | --- | --- |
| ToolBefore (Edit/Write/MultiEdit/ApplyPatch) | PreToolUse | protected paths (deny) |
| ToolAfter (Edit/Write/MultiEdit/ApplyPatch) | PostToolUse | Doctrine entity, Twig (report) |

One process per event (dispatcher pattern), matching `php-runtime-guards`.

## Platform adaptation

1. **PostToolUse cannot deny** on Claude Code or Codex. The source-side deny
   of the Twig check becomes `report` (additionalContext); the Doctrine check
   was already report.
2. **PreToolUse deny** keeps fail-closed semantics and appends a
   `blockingContract` (observedFacts / harm / unblockWhen / recovery).
3. **Codex specifics**: its manifest selects `hooks/codex.json`, matchers use
   uppercase tool names (`Bash|Write|Edit|ApplyPatch`),
   and exec-mode patches are parsed from the inline `*** Begin Patch` payload
   (`scripts/lib/patch-utils.mjs`).
4. **Twig typo fix**: the source harness used `bin/node:console`; this port
   uses `bin/console`.

## Check chain (Twig)

`bin/console lint:twig` (authoritative) → `twigcs` (project
`vendor/bin/twigcs`, then global) → regex tag-pairing fallback. Each stage
returns `undefined` when unavailable so the chain degrades gracefully; the
regex fallback never requires PHP or a Symfony project. Subprocess calls are
bounded (8s) and fail-open.

## Versioning

0.1.0 initial release. Dual manifests stay in lockstep; see GUIDE.md §15.
