#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_file_exists "${ACCEPT_WORKSPACE}/app.json"
require_guard_hook_signal "${MARKERS_WEB_FRONTEND}"
echo "OK web frontend validation (file exists + real validator signal)"
