#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
test -f "${ACCEPT_WORKSPACE}/AGENTS.md"
test -L "${ACCEPT_WORKSPACE}/CLAUDE.md"
test "$(readlink "${ACCEPT_WORKSPACE}/CLAUDE.md")" = "AGENTS.md"
grep -q '<!-- ai-experts:project-instructions:start -->' "${ACCEPT_WORKSPACE}/AGENTS.md"
require_guard_hook_signal 'Git 根项目指令结构未闭合'
require_guard_hook_signal '"toolId":"project-instructions-verify".*"verifiesInvocationId":"[^"]+".*"decision":"changed".*"revisionId":"[^"]+"'
block_line="$(grep -n 'Git 根项目指令结构未闭合' "${ACCEPT_LOG}" | head -1 | cut -d: -f1)"
receipt_line="$(grep -n '"toolId":"project-instructions-verify".*"decision":"changed"' "${ACCEPT_LOG}" | tail -1 | cut -d: -f1)"
test "${receipt_line}" -gt "${block_line}"

echo "OK structural drift blocked and recovered"
