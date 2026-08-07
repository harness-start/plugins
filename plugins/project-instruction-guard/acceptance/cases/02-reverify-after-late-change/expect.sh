#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
grep -qx 'late change' "${ACCEPT_WORKSPACE}/notes.txt"
test -f "${ACCEPT_WORKSPACE}/AGENTS.md"
test -L "${ACCEPT_WORKSPACE}/CLAUDE.md"
if [ "${ACCEPT_HOST}" = "claude" ]; then
  require_guard_hook_signal '最后一次变化之后没有匹配当前状态'
  require_guard_hook_signal 'verify --decision no-change'
  require_guard_hook_signal 'Verify invocation ID.*[a-f0-9-]{36}'
else
  require_guard_hook_signal "${MARKERS_STOP_BLOCK}"
  require_guard_hook_signal '"toolId":"project-instructions-verify".*"decision":"no-change"'
fi

echo "OK late mutation forced a fresh verification"
