#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal 'Bound DWO-|Corrected and bound DWO-|Work Order .*refreshed'
order="$(find "${ACCEPT_WORKSPACE}/.debug-workflow" -maxdepth 1 -name '*.md' -type f | head -1)"
[ -n "${order}" ] || { echo "expect fail: missing work order" >&2; exit 1; }
grep -q '"status": "paused"' "${order}"
grep -Eq '"status": "blocked"|"status": "deferred"' "${order}"
grep -q 'return "unchanged"' "${ACCEPT_WORKSPACE}/src/payment.js"
echo "OK unreproducible bug paused without production mutation"
