#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal "${MARKERS_FIRST_PRINCIPLES}|${MARKERS_HOOK_DENY}"
require_file_absent "${ACCEPT_WORKSPACE}/src/.first-principles/x.js"
echo "OK first-principles denied nested src/.first-principles write"
