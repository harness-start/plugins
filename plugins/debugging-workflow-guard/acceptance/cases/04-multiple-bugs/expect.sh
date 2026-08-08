#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal 'Bound DWO-|Work Order .*refreshed'
node --test "${ACCEPT_WORKSPACE}/test/name.test.mjs" "${ACCEPT_WORKSPACE}/test/email.test.mjs" >/dev/null
order="$(find "${ACCEPT_WORKSPACE}/.debug-workflow" -maxdepth 1 -name '*.md' -type f | head -1)"
[ "$(grep -c '"status": "resolved"' "${order}")" -ge 2 ]
grep -q '"status": "closed"' "${order}"
echo "OK multiple bugs verified separately"
