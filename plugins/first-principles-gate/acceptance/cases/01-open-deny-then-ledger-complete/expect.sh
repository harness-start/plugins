#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

# Host-session honesty: must fail-closed on inert logs (no real hooks).
require_host_session_started
require_guard_hook_signal "${MARKERS_FIRST_PRINCIPLES}|${MARKERS_HOOK_DENY}"
echo "OK first-principles-gate host deny/close signal present"
