#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal 'Bound DWO-|Work Order .*refreshed'
node --test "${ACCEPT_WORKSPACE}/test/name.test.mjs" "${ACCEPT_WORKSPACE}/test/email.test.mjs" >/dev/null
events="$(find "${ACCEPT_WORKSPACE}/.debug-workflow" -name events.jsonl -type f | head -1)"
[ -n "${events}" ] || { echo "expect fail: missing events ledger" >&2; exit 1; }
grep -q '"t":"close"' "${events}"
grep -q '"t":"activate"' "${events}"
echo "OK multiple bugs verified separately"
