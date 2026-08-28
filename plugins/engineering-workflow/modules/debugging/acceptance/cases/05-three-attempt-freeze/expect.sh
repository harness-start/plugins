#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal 'reached 3 failed post-mutation reproductions|failed fix attempts|architecture-review'
events="$(find "${ACCEPT_WORKSPACE}/.debug-workflow" -name events.jsonl -type f | head -1)"
[ -n "${events}" ] || { echo "expect fail: missing events ledger" >&2; exit 1; }
grep -Eq '"t":"pause"|"architectureReview":true|"t":"architecture-review"' "${events}"
if grep -q 'value = 4' "${ACCEPT_WORKSPACE}/src/value.js"; then
  echo "expect fail: fourth production edit bypassed the guard" >&2
  exit 1
fi
echo "OK third failed attempt froze only the active bug"
