#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_file_exists "${ACCEPT_WORKSPACE}/result.txt"
test "$(cat "${ACCEPT_WORKSPACE}/result.txt")" = "ordinary change"
test ! -e "${ACCEPT_WORKSPACE}/.specs"
if [ "${ACCEPT_HOST}" = "claude" ]; then
  claude_transcript="$(find "${ACCEPT_OUT}/home/.claude/projects" -type f -name '*.jsonl' ! -path '*/subagents/*' | head -n 1)"
  test -n "${claude_transcript}"
  agent_count="$(jq -s '[.[] | select(.type == "assistant") | .message.content[]? | select(.type == "tool_use" and .name == "Agent")] | length' "${claude_transcript}")"
  test "${agent_count}" -eq 0
else
  child_count="$(find "${ACCEPT_OUT}/codex-home/sessions" -type f -name '*.jsonl' -exec jq -s 'select(.[0].payload.source.subagent? != null) | 1' {} \; 2>/dev/null | wc -l)"
  test "${child_count}" -eq 0
fi
echo "OK ordinary one-file work bypassed SDD without fan-out"
