#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal "${MARKERS_REASONING_DISCIPLINE}"
workflow="$(find "${ACCEPT_WORKSPACE}/.reasoning-discipline" -mindepth 2 -maxdepth 2 -name workflow.md -type f | head -1)"
[ -n "${workflow}" ] || { echo "expect fail: missing workflow" >&2; exit 1; }
grep -q '"branch": "causal"' "${workflow}"
grep -q '"status": "paused"' "${workflow}"
grep -q '"completionReceipt": null' "${workflow}"
echo "OK evidence-starved causal workflow paused"
