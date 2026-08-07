#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
# Must prove the Stop completion gate fired — not only entry open inject.
require_guard_hook_signal "${MARKERS_STOP_BLOCK}|\"decision\"[[:space:]]*:[[:space:]]*\"block\""
require_guard_hook_signal '完成/关闭需要有效|on-disk first-principles ledger|missing ledger|stale for this session'
echo "OK first-principles-gate completion-claim Stop block signal present"
