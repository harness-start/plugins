#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
grep -qx 'late change' "${ACCEPT_WORKSPACE}/notes.txt"
test -f "${ACCEPT_WORKSPACE}/AGENTS.md"
test -L "${ACCEPT_WORKSPACE}/CLAUDE.md"
require_guard_hook_signal '最后一次变化之后没有匹配当前状态'
require_guard_hook_signal '"toolId":"project-instructions-verify".*"decision":"no-change"'
block_line="$(grep -n '最后一次变化之后没有匹配当前状态' "${ACCEPT_LOG}" | head -1 | cut -d: -f1)"
receipt_line="$(grep -n '"toolId":"project-instructions-verify".*"decision":"no-change"' "${ACCEPT_LOG}" | tail -1 | cut -d: -f1)"
test "${receipt_line}" -gt "${block_line}"

echo "OK late mutation forced a fresh verification"
