# php-runtime-guards DESIGN

Design decisions for the php-runtime-guards plugin (0.1.0).

## Scope

Migrated from `infra/harness-starter` `php-engineering` hooks only. Excluded
deliberately (confirmed with maintainer):

- phpstan family (`php-lint-phpstan`, `php-lint-phpstan-stop`,
  `phpstan-hook-state`, `phpstan-runtime`) → future dedicated static-analysis
  plugin.
- Framework detectors (Laravel / ThinkPHP / Webman) → future per-framework
  plugins.
- Symfony guards (protected paths, Doctrine entity, Twig) → future Symfony
  plugin.

## Event mapping

| Source event | Target platform event | Checks |
| --- | --- | --- |
| ToolBefore (Edit/Write/MultiEdit/ApplyPatch/Bash) | PreToolUse | repositories, unicode escapes, lockfile, protected paths, truncation |
| ToolAfter (Edit/Write/MultiEdit/ApplyPatch) | PostToolUse | php -l, composer validate, encoding, debt, debug |

One process per event (dispatcher pattern), not one process per check: a
single file edit must not spawn N node processes (migration plan §2 P1).

## Platform adaptation

1. **PostToolUse cannot deny** on Claude Code or Codex. Source-side `deny`
   results from `php-syntax`, `composer validate`, `debt`, `debug` become
   `report` (additionalContext). The message keeps the tiered severity
   wording (`dd()` = must remove) so the model can self-correct.
2. **PreToolUse deny** keeps fail-closed semantics and appends a
   `blockingContract` (observedFacts / harm / unblockWhen / recovery) to the
   reason, matching the migration plan's contract convention.
3. **Matchers differ per platform**: Codex's manifest selects
   `hooks/codex.json`, and its matcher matches uppercase tool names
   (`Bash|Write|Edit|ApplyPatch` —
   `exec_command` events arrive as `Bash`). Claude Code uses
   `hooks/claude.json`. Each hooks JSON is written for its host.
4. **Codex hook trust**: plugin-bundled hooks are non-managed hooks and are
   skipped until the user reviews and trusts them in a session. Acceptance
   runs used `--dangerously-bypass-hook-trust` on the locally vetted source.
5. **Codex exec-mode patches**: non-interactive Codex applies edits via the
   Bash tool with an inline `*** Begin Patch` payload and no `file_path`;
   `patchTargetPaths` (`scripts/lib/patch-utils.mjs`) extracts the targets so
   PostToolUse checks still fire.
6. `tool_input` field normalization (Claude `tool.input.file_path` vs Codex
   `tool_input.file_path`, session/cwd fields) happens in
   `scripts/lib/hook-io.mjs`.

## Check-runner structure

- `scripts/checks/*.mjs` — one module per check. Each exports pure detection
  functions taking `{toolName, input}` (PreToolUse) or `(toolInput, filePath)`
  (PostToolUse); formatting lives in the same module.
- `scripts/lib/*.mjs` — plugin-local shared helpers (hook-io, matchers,
  composer-utils, process-utils, git-utils, debt-utils). No cross-plugin
  references, no shared/ vendor mechanism (maintainer decision D3-B): the
  plugin is fully self-contained.
- Subprocess checks (`php -l`, `composer validate`) run in parallel
  (`Promise.all`) inside the single PostToolUse process; hook timeout 30s
  covers the slowest check, not the sum (decision D6-A).

## Net-new semantics (debt / debug)

Baseline is computed from the tool input when available (Edit old/new strings,
Write content), otherwise from git HEAD (`git show HEAD:<path>`); when the
file is not tracked, baseline is empty (every match counts as new). Files
under test/fixture/generated paths are skipped (source semantics). A
justification (`issue/ticket` ref or `-- 原因:` inline note) exempts debt
lines.

## Escapes

- PostToolUse reports are advisory by design; the phpstan Stop gate (future
  plugin) is the hard quality gate.
- `composer validate` warnings about global auth.json or internal
  exact-version notes are intentionally non-blocking ("is valid" passes).
- `| tail -1` truncation is allowed (single-line summary idiom).

## Versioning

0.1.0 initial release. Dual manifests stay in lockstep; see GUIDE.md §15.
