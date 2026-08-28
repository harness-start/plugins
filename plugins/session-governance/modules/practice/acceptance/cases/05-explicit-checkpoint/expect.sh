#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_prompt_context_signal 'explicit.*engineering-review-checkpoint.*read-only reviewer'

expected='export function canEdit(user, resource) {
  return user.role === "admin" || resource.ownerId !== user.id;
}'
test "$(cat "${ACCEPT_WORKSPACE}/src/ownership.mjs")" = "${expected}"
test -z "$(git -C "${ACCEPT_WORKSPACE}" status --porcelain)"
grep -Eq 'P[0-3].*ownership\.mjs:2|ownership\.mjs:2.*P[0-3]' "${ACCEPT_LOG}"

if [[ "${ACCEPT_HOST}" == "claude" ]]; then
  child_count="$(find "${ACCEPT_OUT}/home/.claude/projects" -type f -path '*/subagents/*.jsonl' | wc -l | tr -d ' ')"
else
  child_count="$(find "${ACCEPT_OUT}/codex-home/sessions" -type f -name '*.jsonl' -exec jq -s 'select((.[0].payload.source | type) == "object" and (.[0].payload.source | has("subagent"))) | 1' {} \; 2>/dev/null | wc -l | tr -d ' ')"
fi
test "${child_count}" -eq 1

echo "OK explicit breaker checkpoint returned one anchored read-only review"
