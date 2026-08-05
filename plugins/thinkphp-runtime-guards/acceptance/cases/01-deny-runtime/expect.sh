#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_file_absent "${ACCEPT_WORKSPACE}/runtime/cache/app.php"
require_file_absent "${ACCEPT_WORKSPACE}/runtime/log/app.log"
# Real markers only — never bare runtime/
require_guard_hook_signal "${MARKERS_THINKPHP}|${MARKERS_HOOK_DENY}"
echo "OK thinkphp protected path (file absent + real guard signal)"
