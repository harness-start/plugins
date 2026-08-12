#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'Reproducible-fix evidence'
require_guard_hook_signal '\[Behavioral Regression Guard\] Behavioral failure observed'
require_guard_hook_signal '\[Behavioral Regression Guard\] (Bound BR-|Receipt BR-R)'
for probe in primary boundary representation compat; do
  node "${ACCEPT_WORKSPACE}/test/${probe}.cjs" >/dev/null
done
contract="$(find "${ACCEPT_WORKSPACE}/.behavioral-regression" -maxdepth 1 -name 'BR-*.json' -type f | head -1)"
[ -n "${contract}" ] || { echo "expect fail: failure probe did not lead to a regression contract" >&2; exit 1; }
jq -e '.status == "closed" and all(.cases[]; .receipts.before != null and .receipts.after != null)' "${contract}" >/dev/null
jq -e '[.cases[] | select(.role == "challenge") | .dimension] | unique | length >= 2' "${contract}" >/dev/null
echo "OK failure probe armed the write boundary and the proof closed"
