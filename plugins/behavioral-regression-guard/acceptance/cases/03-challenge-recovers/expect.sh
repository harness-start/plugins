#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal 'Evidence rejected: BEFORE evidence cannot be captured after a production change'
for probe in primary boundary representation compat; do node "${ACCEPT_WORKSPACE}/test/${probe}.cjs" >/dev/null; done
contract="${ACCEPT_WORKSPACE}/.behavioral-regression/BR-20260809-normalize.json"
jq -e '.status == "closed" and all(.cases[]; .receipts.before != null and .receipts.after != null)' "${contract}" >/dev/null
grep -Eq 'lowered === "legacy".*lowered === "legacy_alias"' "${ACCEPT_WORKSPACE}/src/normalize.cjs"
echo "OK representation challenge rejected an incomplete fix and final behavior recovered"
