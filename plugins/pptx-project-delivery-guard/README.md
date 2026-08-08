# PPTX Project Delivery Guard

Guards `artifacts/pptx/<deck-id>/` projects built with PptxGenJS. The hard profile verifies path grammar, contiguous slide manifests, one-slide module ownership, source-hash previews, protected generated paths, required release files, and source/output-bound release receipts.

The plugin does not claim that a deck is persuasive or visually good. Those judgments remain in artifact-bound review evidence. The optional `ui-ux-pro-max` dependency is advice only and cannot write or release artifacts.

工程布局、receipt freshness 与强度边界见 [DESIGN.md](DESIGN.md)。

## Hook behavior

- `PreToolUse` rejects direct writes to slide previews, evidence, reviews, receipts, release manifests, and `dist/`.
- `PostToolUse` and Claude `PostToolUseFailure` recompute bounded project findings.
- `Stop` and `SubagentStop` enforce the `targetStage` declared by `plan.contract.json`.
- Codex hook commands set `AI_EXPERTS_SESSION_ID` and `AI_EXPERTS_TRIGGER_FROM`.

Run the forced project-local lint and atomic release writers with:

```bash
node <plugin-root>/scripts/tools/project-lint.mjs artifacts/pptx/<deck-id>
AI_EXPERTS_SESSION_ID=<session> AI_EXPERTS_TRIGGER_FROM=<source> \
  node <plugin-root>/scripts/tools/project-release.mjs artifacts/pptx/<deck-id>
```

Run offline tests from the marketplace root:

```bash
node --test plugins/pptx-project-delivery-guard/tests/*.test.mjs
```
