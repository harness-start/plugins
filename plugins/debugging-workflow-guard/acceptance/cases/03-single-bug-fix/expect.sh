#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal 'Bound DWO-|Work Order .*refreshed'
node --test "${ACCEPT_WORKSPACE}/test/math.test.mjs" >/dev/null
grep -Eq 'return n \* 2|return 2 \* n' "${ACCEPT_WORKSPACE}/src/math.js"
order="$(find "${ACCEPT_WORKSPACE}/.debug-workflow" -maxdepth 1 -name '*.md' -type f | head -1)"
grep -q '"status": "closed"' "${order}"
grep -q '"status": "resolved"' "${order}"
echo "OK single bug repaired through a closed work order"
