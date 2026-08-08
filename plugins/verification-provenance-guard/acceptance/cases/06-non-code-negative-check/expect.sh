#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
jq -e '.sum == 6 and .max == 3' "${ACCEPT_WORKSPACE}/reports/result.json" >/dev/null
node "${ACCEPT_WORKSPACE}/scripts/validate-report.mjs" >/dev/null
require_guard_hook_signal '\[Verification Provenance Guard\]|hook: Stop'
if grep -Eq 'Completion evidence is incomplete|Completion remains blocked' "${ACCEPT_LOG}"; then
  echo "expect fail: valid non-code workflow was blocked" >&2
  exit 1
fi

echo "OK non-code negative check and final evidence were accepted"
