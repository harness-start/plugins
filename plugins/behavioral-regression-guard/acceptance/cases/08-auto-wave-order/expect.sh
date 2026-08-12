#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'Reproducible-fix evidence'
require_guard_hook_signal '\[Behavioral Regression Guard\] (Bound BR-|Receipt BR-R)'
for probe in primary boundary shared cycle compat; do
  node "${ACCEPT_WORKSPACE}/test/${probe}.cjs" >/dev/null
done
contract="$(find "${ACCEPT_WORKSPACE}/.behavioral-regression" -maxdepth 1 -name 'BR-*.json' -type f | head -1)"
[ -n "${contract}" ] || { echo "expect fail: auto-route did not create a regression contract" >&2; exit 1; }
jq -e '.status == "closed" and all(.cases[]; .receipts.before != null and .receipts.after != null)' "${contract}" >/dev/null
jq -e '[.cases[] | select(.role == "challenge") | .dimension] | unique | length >= 2' "${contract}" >/dev/null
jq -e '.schema == "behavioral-regression/v10" and (.surface.semantics | index("ordering")) != null and .surface.orderingPolicy == "stable-topological-layers" and (.surface.constraintSeam | length > 0) and (.scope.regressionPaths | length > 0)' "${contract}" >/dev/null
jq -e '([.cases[].coverage[]] | unique) as $coverage | all(["primary", "public-seam", "constraint-seam", "compatibility", "independent-order", "shared-order", "conflict-order"][]; . as $token | $coverage | index($token))' "${contract}" >/dev/null
echo "OK auto-routed wave ordering closed with fresh receipts"
