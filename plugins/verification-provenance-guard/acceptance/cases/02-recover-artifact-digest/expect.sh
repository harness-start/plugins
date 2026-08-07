#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
jq -e '.status == "ok"' "${ACCEPT_WORKSPACE}/reports/result.json" >/dev/null
require_guard_hook_signal "artifact sha256 does not match|${MARKERS_STOP_BLOCK}"

echo "OK artifact digest mismatch blocked and recovered"
