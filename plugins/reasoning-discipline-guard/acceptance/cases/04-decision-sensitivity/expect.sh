#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal "${MARKERS_REASONING_DISCIPLINE}"
workflow="$(find "${ACCEPT_WORKSPACE}/.reasoning-discipline" -mindepth 2 -maxdepth 2 -name workflow.md -type f | head -1)"
[ -n "${workflow}" ] || { echo "expect fail: missing workflow" >&2; exit 1; }
grep -q '"branch": "decision"' "${workflow}"
grep -q '"status": "closed"' "${workflow}"
conclusion="$(dirname "${workflow}")/05-conclusion.md"
require_file_exists "${conclusion}"
grep -Eiq 'in-process|in process' "${conclusion}"
echo "OK decision workflow closed after sensitivity analysis"
