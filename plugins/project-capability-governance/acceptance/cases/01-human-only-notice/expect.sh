#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal 'hook: Stop|Hook Stop'
NOTICE_STATE="${ACCEPT_WORKSPACE}/.project-capabilities/.notice-state.json"
require_file_exists "${NOTICE_STATE}"
if ! jq -e '.version == 1 and .notified == {"pc-release-check": 1}' "${NOTICE_STATE}" >/dev/null; then
  echo "expect fail: Stop hook did not consume exactly the pending proposal revision" >&2
  exit 1
fi
if grep -Eq '\[Gate Arbiter\].*project-capability|permissionDecision[^[:space:]]*deny.*Project Capability' "${ACCEPT_LOG}"; then
  echo "expect fail: human-only notice became a blocking decision" >&2
  exit 1
fi
for path in "${ACCEPT_WORKSPACE}/.claude" "${ACCEPT_WORKSPACE}/.agents" "${ACCEPT_WORKSPACE}/.codex"; do
  if [ -e "${path}" ]; then
    echo "expect fail: Stop notice triggered project capability implementation: ${path}" >&2
    exit 1
  fi
done
echo "OK human-only project capability notice remained non-blocking"
