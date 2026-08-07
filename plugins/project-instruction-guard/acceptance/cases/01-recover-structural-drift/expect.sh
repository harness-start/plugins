#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
test -f "${ACCEPT_WORKSPACE}/AGENTS.md"
test -L "${ACCEPT_WORKSPACE}/CLAUDE.md"
test "$(readlink "${ACCEPT_WORKSPACE}/CLAUDE.md")" = "AGENTS.md"
grep -q '<!-- ai-experts:project-instructions:start -->' "${ACCEPT_WORKSPACE}/AGENTS.md"
if [ "${ACCEPT_HOST}" = "claude" ]; then
  require_guard_hook_signal 'Git 根项目指令结构未闭合'
  require_guard_hook_signal 'Decision.*changed'
  require_guard_hook_signal 'Revision ID.*[a-f0-9-]{36}'
  require_guard_hook_signal 'Verify invocation ID.*[a-f0-9-]{36}'
else
  require_guard_hook_signal "${MARKERS_STOP_BLOCK}"
  require_guard_hook_signal '"toolId":"project-instructions-verify".*"verifiesInvocationId":"[^"]+".*"decision":"changed".*"revisionId":"[^"]+"'
fi

echo "OK structural drift blocked and recovered"
