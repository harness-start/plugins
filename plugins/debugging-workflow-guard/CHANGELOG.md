# Changelog

## 0.1.1

- Map verified Codex child-session review events back to their parent workflow so nonce injection, read-only enforcement, and review receipts work without manual hook calls.

## 0.1.0

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
