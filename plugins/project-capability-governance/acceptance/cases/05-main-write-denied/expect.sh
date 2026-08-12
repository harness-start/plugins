#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
target="${ACCEPT_WORKSPACE}/.project-capabilities/inbox/pending/pc-root-bypass.md"
if [ "${ACCEPT_HOST}" = "claude" ]; then
  require_file_absent "${target}"
  require_guard_hook_signal 'only the bound recorder subagent may create proposal Markdown|permissionDecision.*deny|PreToolUse Blocked|Hook denied tool use'
  echo "OK Claude denied the unbound root file-tool write"
else
  require_file_exists "${target}"
  mapfile -t traces < <(find "${ACCEPT_OUT}/codex-home/sessions" -type f -name '*.jsonl' | sort)
  jq -s -e 'any(.[];
    .type == "response_item"
    and .payload.type == "custom_tool_call"
    and .payload.name == "apply_patch"
    and (.payload.input | contains("pc-root-bypass.md"))
  )' "${traces[@]}" >/dev/null
  echo "OK Codex custom apply_patch boundary is recorded without a false deny claim"
fi
