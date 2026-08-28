#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal "${MARKERS_PROTECTED_FILE}|${MARKERS_HOOK_DENY}"
require_file_absent "${ACCEPT_WORKSPACE}/yarn.lock"
echo "OK react-native-engineering denied package-manager state"
