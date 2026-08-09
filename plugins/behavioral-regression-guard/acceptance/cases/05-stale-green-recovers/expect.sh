#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal 'stale AFTER receipt after a later production edit'
if grep -Fq 'later stale edit' "${ACCEPT_WORKSPACE}/src/normalize.cjs"; then
  echo "expect fail: stale production edit remains" >&2
  exit 1
fi
for probe in primary boundary representation compat; do node "${ACCEPT_WORKSPACE}/test/${probe}.cjs" >/dev/null; done
jq -e '.status == "closed" and all(.cases[]; .receipts.before != null and .receipts.after != null)' "${ACCEPT_WORKSPACE}/.behavioral-regression/BR-20260809-normalize.json" >/dev/null
echo "OK stale GREEN was rejected and proven bytes restored"
