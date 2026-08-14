#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started

if [ "${ACCEPT_HOST}" = "claude" ]; then
  require_guard_hook_signal 'tool_dispatch_start tool=Skill'
  answer="$(awk '/^===== claude-debug-file =====$/{exit} {print}' "${ACCEPT_LOG}" | grep -E '^(VERDICT|LOAD_BEARING|KILL_TEST)=' | tail -3 | tr -d ',')"
else
  require_guard_hook_signal 'skills/reasoning-discipline/SKILL.md'
  answer="$(grep -E '^(VERDICT|LOAD_BEARING|KILL_TEST)=' "${ACCEPT_LOG}" | tail -3 | tr -d ',')"
fi

fixture="${ACCEPT_WORKSPACE}/decision.json"
crossover="$(jq -r '((.vendors.a.fixed_per_month - .vendors.b.fixed_per_month) / (.vendors.b.per_request - .vendors.a.per_request)) | round' "${fixture}")"
crossover_next="$((crossover + 1))"
winner_key="$(jq -r '.monthly_requests as $requests | .vendors | to_entries | min_by(.value.fixed_per_month + (.value.per_request * $requests)) | .key' "${fixture}")"
winner_id="$(jq -r --arg key "${winner_key}" '.vendors[$key].id' "${fixture}")"

printf '%s\n' "${answer}" | sed -n '1p' | grep -Eq "^VERDICT=(${winner_key}|${winner_id})$"
printf '%s\n' "${answer}" | sed -n '2p' | grep -Eq "^LOAD_BEARING=(${crossover}|${crossover_next})$"
printf '%s\n' "${answer}" | sed -n '3p' | grep -Eq "^KILL_TEST=.*${crossover}"

require_file_absent "${ACCEPT_WORKSPACE}/.reasoning-discipline"
echo "OK decision identified the current option and dynamic crossover"
