#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal 'expected frame|The active reasoning workflow cannot end yet|Stop hook blocked|hook: Stop Blocked'
workflow="$(find "${ACCEPT_WORKSPACE}/.reasoning-discipline" -mindepth 2 -maxdepth 2 -name workflow.md -type f | head -1)"
[ -n "${workflow}" ] || { echo "expect fail: missing workflow" >&2; exit 1; }
if grep -q '"status": "paused"' "${workflow}"; then
  echo "OK premature conclusion was rejected before honest pause"
elif grep -q '"status": "closed"' "${workflow}"; then
  dir="$(dirname "${workflow}")"
  for file in 01-frame.md 02-analysis.md 03-challenge.md 04-cross-check.md 05-conclusion.md; do
    require_file_exists "${dir}/${file}"
  done
  grep -q '"completionReceipt": "RD-R5"' "${workflow}"
  echo "OK premature conclusion was rejected before ordered recovery and close"
else
  echo "expect fail: workflow neither paused nor validly recovered" >&2
  exit 1
fi
