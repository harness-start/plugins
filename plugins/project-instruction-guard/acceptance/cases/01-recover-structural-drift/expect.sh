#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
test -f "${ACCEPT_WORKSPACE}/AGENTS.md"
test -L "${ACCEPT_WORKSPACE}/CLAUDE.md"
test "$(readlink "${ACCEPT_WORKSPACE}/CLAUDE.md")" = "AGENTS.md"
grep -q '<!-- ai-experts:project-instructions:start -->' "${ACCEPT_WORKSPACE}/AGENTS.md"
if [ "${ACCEPT_HOST}" = "claude" ]; then
  state_dir="${ACCEPT_OUT}/home/.plugin-data/project-instruction-guard"
  mapfile -t state_files < <(find "${state_dir}" -maxdepth 1 -type f -name '*.json' -print 2>/dev/null)
  test "${#state_files[@]}" -eq 1
  jq -e '
    .version == 2
    and (.mutationRevision | type == "number")
    and .mutationRevision > 0
    and .verifiedRevision == .mutationRevision
    and (.verifiedStateDigest | type == "string" and length == 64)
    and .reminderPending == false
  ' "${state_files[0]}" >/dev/null
  require_guard_hook_signal 'Git 根项目指令结构未闭合'
  require_guard_hook_signal 'Revision ID.*[a-f0-9-]{36}'
  require_guard_hook_signal 'Verify invocation ID.*[a-f0-9-]{36}'
else
  require_guard_hook_signal "${MARKERS_STOP_BLOCK}"
  require_guard_hook_signal '"toolId":"project-instructions-verify".*"verifiesInvocationId":"[^"]+".*"decision":"changed".*"revisionId":"[^"]+"'
fi

echo "OK structural drift blocked and recovered"
