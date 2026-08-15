---
name: cross-repo-history-migration
description: Move selected paths from one local Git repository into a new repository while preserving their commit history. Use when splitting a repository, extracting a module, or preparing a history-preserving cross-repository migration. Do not use for ordinary file copies, same-repository moves, or imports where history is intentionally discarded.
---

# Cross-repo history migration

Create a new filtered repository from selected paths without modifying the source repository. The bundled tools use a two-command protocol: a read-only preflight returns `sourceHead` and `planDigest`; execute accepts exactly those values and aborts if the source or plan changed.

This Skill does not install hooks. A prompt-time hook cannot reliably prove Git history or filesystem atomicity. The deterministic scripts enforce the safety boundary at the mutation point, while the Skill owns scope decisions and evidence review.

## Workflow

1. **Preflight** — identify one local source repository, an absent target path whose parent already exists, one source ref, and the smallest repository-relative include-path set. Confirm `git-filter-repo` is available. The source repository must be clean.
2. **Seal** — run the preflight script and preserve its exact `sourceHead`, `planDigest`, observed `filterRepoVersion`, normalized include paths, and commit count. Treat this output as a short-lived seal, not as a reusable plan file.
3. **Execute** — run the execute script with the same source, target, ref, target branch, include paths, and the sealed values. The source repository remains read-only. The tool clones into a temporary directory under the target parent, filters there, keeps only the requested local branch, removes remotes and unrelated tags, then publishes with an atomic rename. The target path must remain absent until publication.
4. **Verify** — independently compare the source head and refs, target branch and head, selected file contents, excluded paths, target remotes, commit count, and clean worktree. History count alone is insufficient; inspect representative commits with `git log --follow -- <path>` when rename history matters.
5. **Finish** — report source and target paths, sealed and observed heads, plan digest, included and excluded scope, verification commands, and any limitation. Do not push, create a remote repository, archive the source, or delete either repository unless the user separately authorizes that external effect.

## Command contract

Resolve the plugin root from the selected Skill location. On Codex, use the plugin's `PLUGIN_ROOT`; on Claude Code, use `CLAUDE_PLUGIN_ROOT`. Keep these platform-specific commands separate.

Set provenance for every bundled tool call:

```bash
AI_EXPERTS_SESSION_ID="<current-session-id>" \
AI_EXPERTS_TRIGGER_FROM="cross-repo-history-migration:preflight" \
node "${PLUGIN_ROOT}/scripts/git-history-migration-preflight.mjs" \
  --source /absolute/source \
  --target /absolute/target \
  --ref main \
  --target-branch main \
  --include packages/widget
```

For Claude Code, replace `${PLUGIN_ROOT}` with `${CLAUDE_PLUGIN_ROOT}`. Pass every included path as its own `--include`. Then execute with the same arguments plus:

```text
--expected-source-head <sourceHead> --expected-plan-digest <planDigest>
```

Both commands return a single JSON receipt. A non-zero exit or `ok: false` is a refusal, not a partial success.

## Hard boundaries

- Include paths must be normalized repository-relative paths without `..`, `.`, empty segments, absolute prefixes, or backslashes.
- The source must be a clean local Git worktree. The target may not equal or sit inside the source after resolving its parent symlinks, and the target path must be absent.
- Never weaken the seal after a stale-head or digest refusal. Re-run preflight, review the new facts, and execute only with the new pair.
- Never run `git filter-repo` in the source repository. Do not use force-push, source ref deletion, `git reset --hard`, or destructive cleanup as part of this workflow.
- Tool cleanup is limited to its unique temporary directory. A failed execution must leave the requested target absent.
