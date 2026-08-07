#!/usr/bin/env bash
set -euo pipefail

case_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
plugin_dir="$(cd "${case_dir}/../../.." && pwd)"
entry="${plugin_dir}/scripts/skill-routing-transparency.mjs"

session_output="$(printf '%s' '{"session_id":"fixture-session"}' | node "${entry}" session codex)"
prompt_output="$(printf '%s' '{"session_id":"fixture-session","prompt":"实现 Skill 路由透明度"}' | node "${entry}" prompt claude)"
followup_output="$(printf '%s' '{"session_id":"fixture-session","prompt":"继续"}' | node "${entry}" prompt codex)"

printf '%s' "${session_output}" | grep -q 'Skill Routing Transparency'
printf '%s' "${session_output}" | grep -q 'AI_EXPERTS_SESSION_ID'
printf '%s' "${prompt_output}" | grep -q 'Skill Routing Transparency Reminder'

if [ -n "${followup_output}" ]; then
  echo "FAIL short follow-up must not emit a routing reminder" >&2
  exit 1
fi

echo "OK skill-routing-transparency offline fixture"
