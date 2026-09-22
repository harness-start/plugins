#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal 'Receipt R-[0-9]+: reproduction failure'
grep -Eq 'write_stdin|functions\.write_stdin' "${ACCEPT_LOG}"

node --test "${ACCEPT_WORKSPACE}/test/slow-value.test.mjs" >/dev/null
grep -Fq 'return 42' "${ACCEPT_WORKSPACE}/src/value.mjs"

events="$(find "${ACCEPT_WORKSPACE}/.debug-workflow" -name events.jsonl -type f | head -1)"
state="$(find "${ACCEPT_WORKSPACE}/.debug-workflow/.state/sessions" -name '*.json' -type f | head -1)"
[ -n "${events}" ] || { echo "expect fail: missing events ledger" >&2; exit 1; }
[ -n "${state}" ] || { echo "expect fail: missing session state" >&2; exit 1; }
grep -q '"t":"close"' "${events}"
jq -e '
  (.pendingCommands == [])
  and ([.receipts[] | select(.kind == "reproduction" and .outcome == "failure")] | length == 1)
  and ([.receipts[] | select(.kind == "reproduction" and .outcome == "success")] | length >= 1)
  and (
    ([.receipts[] | select(.kind == "reproduction" and .outcome == "failure")][0].id | ltrimstr("R-") | tonumber)
    < ([.receipts[] | select(.kind == "mutation" and .outcome == "success")][0].id | ltrimstr("R-") | tonumber)
  )
' "${state}" >/dev/null

echo "OK long-running Codex reproduction produced one ordered terminal failure receipt and closed"
