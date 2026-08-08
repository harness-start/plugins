#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
grep -Eq 'export const add|=>.*a.*b' "${ACCEPT_WORKSPACE}/src/add.js"
node --test "${ACCEPT_WORKSPACE}/tests/add.test.mjs" >/dev/null
require_guard_hook_signal '\[Verification Provenance Guard\]|hook: Stop'
if grep -Eq 'Completion evidence is incomplete|Completion remains blocked' "${ACCEPT_LOG}"; then
  echo "expect fail: valid refactor workflow was blocked" >&2
  exit 1
fi

echo "OK refactor baseline and final green were accepted"
