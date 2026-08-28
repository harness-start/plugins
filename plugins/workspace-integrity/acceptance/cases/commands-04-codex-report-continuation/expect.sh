#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_file_exists "${ACCEPT_WORKSPACE}/report-probe.js"
require_file_exists "${ACCEPT_WORKSPACE}/continued-after-report.txt"
grep -Fxq 'const agent = { rejectUnauthorized: false };' "${ACCEPT_WORKSPACE}/report-probe.js"
grep -Fxq 'CONTINUED' "${ACCEPT_WORKSPACE}/continued-after-report.txt"
if [ "${ACCEPT_HOST:-}" = "codex" ]; then
  if [ "$(grep -Ec '^hook: PostToolUse Completed$' "${ACCEPT_LOG}")" -lt 2 ]; then
    echo "expect fail: Codex did not complete both PostToolUse hook rounds" >&2
    exit 1
  fi
  if grep -Fq 'No tool output found for tool call' "${ACCEPT_LOG}"; then
    echo "expect fail: Codex transport rejected a tool-call continuation" >&2
    exit 1
  fi
else
  require_guard_hook_signal '\[Insecure TLS Notice\]'
fi
echo "OK command-safety report preserved the next tool call"
