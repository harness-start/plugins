# Delivery Evidence

Target-native delivery gates for API and design drift, document integrity, spec prerequisites, TDD order, verification provenance, external effects, GitLab closure, long-task and migration ledgers, and design/PPTX/video evidence.

Eighteen source hooks are consolidated into one PreToolUse entry, one PostToolUse entry, and one Stop entry. Node.js 20+ runs the `.mjs` sources directly: there is no install, compilation, generated bundle, or vendored source stage.

Cross-event evidence is read from the stable `process-confidence` receipt location, `.process-confidence/runs/*/receipts/*.json`; the receipt schema allows the additional MCP provenance fields used by domain gates. TDD state lives under `PLUGIN_DATA` or `CLAUDE_PLUGIN_DATA`. Missing state or receipts fail open unless a completion claim itself activates a deterministic file/provenance gate.

PostToolUse checks are advisory because the write already occurred. PreToolUse spec checks and Stop completion checks use the host's real blocking contracts.

| Target entry | Migrated behavior IDs |
| --- | --- |
| PreToolUse | `spec-plan-artifact-gate` |
| PostToolUse | `api-breaking-change-guard`, `design-contract-drift-guard`, `docs-consistency-guard`, `documents-encoding-guard`, `tdd-sequence-tracker` |
| Stop | `delivery-closure-gate`, `design-accessibility-completion-gate`, `external-effect-closure-gate`, `gitlab-review-completion-gate`, `migration-parity-completion-gate`, `next-step-solvability-gate`, `pptx-completion-gate`, `skill-next-step-gate`, `task-ledger-completion-gate`, `tdd-sequence-completion-gate`, `verification-provenance-gate`, `video-production-evidence-gate` |
