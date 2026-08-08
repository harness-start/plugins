#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal 'reached 3 failed post-mutation reproductions|failed fix attempts|architecture-review'
order="$(find "${ACCEPT_WORKSPACE}/.debug-workflow" -maxdepth 1 -name '*.md' -type f | head -1)"
grep -q '"status": "architecture-review"' "${order}"
grep -q '"status": "paused"' "${order}"
if grep -q 'value = 4' "${ACCEPT_WORKSPACE}/src/value.js"; then
  echo "expect fail: fourth production edit bypassed the guard" >&2
  exit 1
fi
echo "OK third failed attempt froze only the active bug"
