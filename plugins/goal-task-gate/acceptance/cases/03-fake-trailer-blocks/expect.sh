#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal "${MARKERS_GOAL_TASK}|${MARKERS_STOP_BLOCK}"
echo "OK goal-task-gate trailer/arm signal present"
