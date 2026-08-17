#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_hook_prompt_signal '"hookEventName":"SubagentStart".*trusted subagent principal=[^ ]+:agent:[^ ]+'
require_guard_hook_signal 'tool_dispatch_start tool=Agent'
require_guard_hook_signal 'tool_dispatch_end tool=Agent.*outcome=ok'
grep -Eq '^AGENT_RETURNED .*:agent:' "${ACCEPT_LOG}"
if grep -Eq 'SubagentStop.*permissionDecision.*deny|SubagentStop.*decision.*block' "${ACCEPT_LOG}"; then
  echo "expect fail: review subagent return was blocked" >&2
  exit 1
fi
echo "OK Claude review agent received a trusted unique principal and returned"
