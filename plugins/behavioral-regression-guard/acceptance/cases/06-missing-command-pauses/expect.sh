#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal '\[Behavioral Regression Guard\] Bound BR-20260809-normalize'
contract="${ACCEPT_WORKSPACE}/.behavioral-regression/BR-20260809-normalize.json"
jq -e '.status == "paused" and all(.cases[]; .receipts.before == null and .receipts.after == null) and (.recovery.nextAction | test("install|provide|available"; "i"))' "${contract}" >/dev/null
if [ -e "${ACCEPT_WORKSPACE}/definitely-missing-behavior-probe" ]; then
  echo "expect fail: missing probe was fabricated" >&2
  exit 1
fi
echo "OK missing command produced no receipt and workflow paused honestly"
