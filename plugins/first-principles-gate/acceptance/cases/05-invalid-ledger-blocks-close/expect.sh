#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal "${MARKERS_STOP_BLOCK}|\"decision\"[[:space:]]*:[[:space:]]*\"block\""
require_guard_hook_signal 'Completion or closure requires|unknown atom id|uncertainties|on-disk first-principles ledger|stale for this session'
echo "OK first-principles-gate invalid-ledger Stop block signal present"
