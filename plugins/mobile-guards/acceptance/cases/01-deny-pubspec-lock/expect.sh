#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_file_absent "${ACCEPT_WORKSPACE}/pubspec.lock"
require_guard_hook_signal "${MARKERS_LOCKFILE}|${MARKERS_HOOK_DENY}"
echo "OK mobile lockfile deny"
