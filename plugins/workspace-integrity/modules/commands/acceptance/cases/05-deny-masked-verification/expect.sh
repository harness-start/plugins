#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal '\[Verification Integrity Guard\]'
test "$(tr -d '\r\n' < "${ACCEPT_WORKSPACE}/verification-result.txt")" = "FAILED"
if node --test "${ACCEPT_WORKSPACE}/test/status.test.mjs" >/dev/null 2>&1; then
  echo "expect fail: synthetic failing test was modified" >&2
  exit 1
fi
echo "OK masked verification was denied and the native failure was observed"
