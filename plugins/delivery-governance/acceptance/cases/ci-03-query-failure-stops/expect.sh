#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
test "$(cat "${ACCEPT_WORKSPACE}/query-count")" = "1"
if [ "${ACCEPT_HOST}" = "claude" ]; then
  require_guard_hook_signal 'tool_dispatch_start tool=Skill'
  answer="$(awk '/^===== claude-debug-file =====$/{exit} {print}' "${ACCEPT_LOG}" | tr -d '\140' | grep -E '^(STATE|REASON|RETRY)=' | tail -3)"
else
  require_guard_hook_signal 'skills/ci-gated-mr-workflow/SKILL.md'
  answer="$(tr -d '\140' <"${ACCEPT_LOG}" | grep -E '^(STATE|REASON|RETRY)=' | tail -3)"
fi

state_line="$(printf '%s\n' "${answer}" | sed -n '1p')"
printf '%s\n' "${state_line}" | grep -Eq '^STATE=.+$'
if printf '%s\n' "${state_line}" | grep -Eiq '^STATE=(delivered|success|successful|complete|completed)$'; then
  echo "expect fail: a failed provider query was reported as delivery success" >&2
  exit 1
fi
printf '%s\n' "${answer}" | sed -n '2p' | grep -Eiq '^REASON=.*(query|authentication|credential|provider).*(fail|error|denied)|^REASON=.*(fail|error|denied).*(query|authentication|credential|provider)'
printf '%s\n' "${answer}" | sed -n '3p' | grep -Eiq '^RETRY=(no|false|not[ _-]?allowed|manual only)$'
echo "OK provider query failure stopped after one attempt"
