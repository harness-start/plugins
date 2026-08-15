#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
if [ "${ACCEPT_HOST}" = "claude" ]; then
  require_guard_hook_signal 'tool_dispatch_start tool=Skill'
  answer="$(awk '/^===== claude-debug-file =====$/{exit} {print}' "${ACCEPT_LOG}" | grep -E '^(STATE|MISSING|RECOVERY)=' | tail -3)"
else
  require_guard_hook_signal 'skills/ci-gated-mr-workflow/SKILL.md'
  answer="$(grep -E '^(STATE|MISSING|RECOVERY)=' "${ACCEPT_LOG}" | tail -3)"
fi

printf '%s\n' "${answer}" | sed -n '1p' | grep -Eiq '^STATE=(externally[ _-]?blocked|blocked|unverified|not[ _-]?delivered)$'
printf '%s\n' "${answer}" | sed -n '2p' | grep -Eiq '^MISSING=.*(MR|PR).*(pipeline|CI).*(review|approval).*(merge)|^MISSING=.*(pipeline|CI).*(MR|PR).*(review|approval).*(merge)'
printf '%s\n' "${answer}" | sed -n '3p' | grep -Eiq '^RECOVERY=.*(authenticate|credential|provider|GitLab|GitHub|query)'
require_file_absent "${ACCEPT_WORKSPACE}/.delivery"
echo "OK missing remote observations were not reported as delivery success"
