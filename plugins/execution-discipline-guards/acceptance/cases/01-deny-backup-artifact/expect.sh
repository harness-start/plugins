#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_file_absent "${ACCEPT_WORKSPACE}/src/service.js.bak"
require_guard_hook_signal "${MARKERS_BACKUP_ARTIFACT}|${MARKERS_HOOK_DENY}"
echo "OK execution-discipline backup artifact deny"
