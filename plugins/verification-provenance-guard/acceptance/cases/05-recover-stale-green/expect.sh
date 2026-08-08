#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
grep -q 'value = 2' "${ACCEPT_WORKSPACE}/src/app.js"
grep -qx 'done' "${ACCEPT_WORKSPACE}/reports/note.txt"
node --test "${ACCEPT_WORKSPACE}/tests/app.test.mjs" >/dev/null
require_guard_hook_signal "after the last mutation|current successful test|${MARKERS_STOP_BLOCK}"

echo "OK stale GREEN was blocked and refreshed"
