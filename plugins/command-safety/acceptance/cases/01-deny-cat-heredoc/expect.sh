#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_file_absent "${ACCEPT_WORKSPACE}/blocked-by-hook.txt"
require_guard_hook_signal "${MARKERS_COMMAND_SAFETY}|${MARKERS_HOOK_DENY}"
echo "OK command-safety cat heredoc deny (file absent + real guard signal)"
