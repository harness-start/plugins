#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
grep -q 'value = 2' "${ACCEPT_WORKSPACE}/src/app.js"
node --test "${ACCEPT_WORKSPACE}/tests/app.test.mjs" >/dev/null
require_guard_hook_signal "Final source revision lacks required independent verification|${MARKERS_STOP_BLOCK}"

echo "OK missing review blocked and recovered"
