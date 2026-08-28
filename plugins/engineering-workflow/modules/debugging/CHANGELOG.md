# Changelog

## 0.3.0

- Same-session CLI `resume` with a higher `run.epoch` rebinds the existing work-order id instead of marking the ledger invalid.
- Stop no longer requires pausing or closing an open work order at the end of a turn.
- Production writes require a hook-issued failing reproduction baseline, not snapshot enums such as `supported` / `fixing` / `in-progress`.
- New ledgers are write-once `intent.json` plus append-only `events.jsonl`; markdown work orders remain readable.
- Close/completion uses hook-observed receipts after the last relevant mutation and does not require copied `R-N` snapshot fields.
- Ledger mutations go through the plugin `debug-workflow` CLI; direct file-tool or equivalent shell writes are denied.
- SessionStart reports folded resumable state and never selects a work order.

## 0.2.0

- Add the focused `debug-workflow` Skill.
- Activate hooks only through a valid Debug Work Order mutation.
- Add multi-bug attribution, session leases, attempt limits, and receipt-backed completion gates.
- Support Claude Code and Codex hook manifests.
- Publish explicit lifecycle vocabularies and actionable schema recovery messages.
- Preserve Codex/DeepSeek tool results while surfacing PostToolUse receipts through host-visible hook signals.
- Exclude `/dev/null` redirections from shell mutation accounting.
- Require exact pre-mutation failing baselines for the active bug and every bug affected by a shared fix, plus receipt-backed hypothesis and root-cause evidence before production writes.
- Scope completion freshness to per-bug and shared-fix-owner mutations, and independently scan for leftover work-order debug markers on closed orders.
- Preserve receipts through in-place correction of transiently invalid work orders while preventing id or epoch replacement; leave failed initial writes with no file inert.
- Allow schema-valid paused architecture-review handoffs to stop without misrepresenting unresolved work as complete.
