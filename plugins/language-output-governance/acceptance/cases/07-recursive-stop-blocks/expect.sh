#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal "${MARKERS_LANGUAGE_OUTPUT_GATE}|${MARKERS_STOP_BLOCK}"
echo "OK language-output Stop still blocks unauthorized-script drift"
