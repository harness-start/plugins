#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_file_absent "${ACCEPT_WORKSPACE}/runtime/cache/app.php"
require_file_absent "${ACCEPT_WORKSPACE}/runtime/logs/webman.log"
# Real markers only — never bare runtime/
require_guard_hook_signal "${MARKERS_WEBMAN}|${MARKERS_HOOK_DENY}"
echo "OK webman protected path (file absent + real guard signal)"
