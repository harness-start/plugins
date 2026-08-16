#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
if [ "${ACCEPT_HOST:-}" = "claude" ]; then
  require_guard_hook_signal "${MARKERS_LANGUAGE_OUTPUT_FEEDBACK}"
elif grep -Fq 'No tool output found for tool call' "${ACCEPT_LOG}"; then
  echo "expect fail: Codex provider lost a tool result after PostToolUse" >&2
  exit 1
fi
require_guard_hook_signal "${MARKERS_LANGUAGE_OUTPUT_GATE}|${MARKERS_STOP_BLOCK}"
target="${ACCEPT_WORKSPACE}/answer.txt"
require_file_exists "${target}"
grep -Fxq '这是使用简体中文编写的最终回答。' "${target}"

state_dir="${ACCEPT_WORKSPACE}/.language-output/state"
local_gitignore="${ACCEPT_WORKSPACE}/.language-output/.gitignore"
test -d "${state_dir}"
test ! -d "${ACCEPT_WORKSPACE}/.language-output/.state"
test "$(cat "${local_gitignore}")" = "state/"
test "$(cat "${ACCEPT_WORKSPACE}/.gitignore")" = "vendor/"

echo "OK zh-CN profile repaired tool text and final response"
