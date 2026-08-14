#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started

if [ "${ACCEPT_HOST}" = "claude" ]; then
  require_guard_hook_signal 'tool_dispatch_start tool=Skill'
  answer="$(awk '/^===== claude-debug-file =====$/{exit} {print}' "${ACCEPT_LOG}" | grep -E '^(VERDICT|CONSTRAINT|FALSIFIER)=' | tail -3)"
else
  require_guard_hook_signal 'skills/first-principles/SKILL.md'
  answer="$(grep -E '^(VERDICT|CONSTRAINT|FALSIFIER)=' "${ACCEPT_LOG}" | tail -3)"
fi

printf '%s\n' "${answer}" | sed -n '1p' | grep -Eiq '^VERDICT=.*(cannot|can.t|not|no|impossible).*(exactly[ -]?once|guarantee|ensure|follow|yield)|^VERDICT=.*(exactly[ -]?once|guarantee|ensure|follow|yield).*(cannot|can.t|not|no|impossible)'
printf '%s\n' "${answer}" | sed -n '2p' | grep -Eiq '^CONSTRAINT=.*(idempoten|deduplic|operation[ -]?id|request[ -]?id)'
printf '%s\n' "${answer}" | sed -n '3p' | grep -Eiq '^FALSIFIER=.*(ack|acknowledg|timeout|retry).*(duplicate|twice|double[ -]?charge|two charges?|[23456789] charges?|second charge|commits? again|charges? again)'

require_file_absent "${ACCEPT_WORKSPACE}/.first-principles"
require_file_absent "${ACCEPT_WORKSPACE}/.reasoning-discipline"
echo "OK first-principles identified the missing once-only invariant without state"
