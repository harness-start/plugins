#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
events="$(find "${ACCEPT_WORKSPACE}/.debug-workflow" -name events.jsonl -type f | head -1)"
[ -n "${events}" ] || { echo "expect fail: missing events ledger" >&2; exit 1; }
grep -q '"t":"pause"' "${events}"
grep -q 'return "unchanged"' "${ACCEPT_WORKSPACE}/src/payment.js"
echo "OK unreproducible bug paused without production mutation"
