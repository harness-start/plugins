#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
grep -q 'value = 2' "${ACCEPT_WORKSPACE}/src/app.js"
node --test "${ACCEPT_WORKSPACE}/tests/app.test.mjs" >/dev/null
require_guard_hook_signal "test mutation before the RED|expected_failure command evidence|${MARKERS_STOP_BLOCK}"

echo "OK green-only code completion was blocked"
