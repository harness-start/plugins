#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal "${MARKERS_REASONING_DISCIPLINE}"
workflow="$(find "${ACCEPT_WORKSPACE}/.reasoning-discipline" -mindepth 2 -maxdepth 2 -name workflow.md -type f | head -1)"
[ -n "${workflow}" ] || { echo "expect fail: missing workflow" >&2; exit 1; }
grep -q '"status": "closed"' "${workflow}"
grep -q '"completionReceipt": "RD-R5"' "${workflow}"
dir="$(dirname "${workflow}")"
for file in 01-frame.md 02-analysis.md 03-challenge.md 04-cross-check.md 05-conclusion.md; do
  require_file_exists "${dir}/${file}"
done
grep -Pq '"conclusion":\s*"[^"]*(?<!\d)21(?!\d)' "${dir}/05-conclusion.md"
echo "OK exact workflow closed with answer 21"
