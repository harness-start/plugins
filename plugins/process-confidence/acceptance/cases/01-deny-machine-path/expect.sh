#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_file_absent "${ACCEPT_WORKSPACE}/.process-confidence/config.json"
# Real markers only — never bare .process-confidence path fragments.
require_guard_hook_signal "${MARKERS_PCF}|${MARKERS_HOOK_DENY}"
echo "OK process-confidence machine path protected (file absent + real guard signal)"
