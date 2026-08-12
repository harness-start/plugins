#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'Proof-sensitive work'
require_guard_hook_signal "${MARKERS_REASONING_DISCIPLINE}"

workflow="$(find "${ACCEPT_WORKSPACE}/.reasoning-discipline" -mindepth 2 -maxdepth 2 -name workflow.md -type f | head -1)"
[ -n "${workflow}" ] || { echo "expect fail: explicit blind-draw case did not create a workflow" >&2; exit 1; }
dir="$(dirname "${workflow}")"
grep -q '"status": "closed"' "${workflow}"
grep -q '"completionReceipt": "RD-R5"' "${workflow}"
grep -q '"controlAssignments"' "${dir}/01-frame.md"
if grep -q '"controlEffect": "allocation"' "${dir}/01-frame.md"; then
  echo "expect fail: explicit blind draw must not expose a participant allocation strategy" >&2
  exit 1
fi
grep -Eq '"controlEffect": "(blocked|none)"' "${dir}/01-frame.md"
grep -q '"kind": "control-assignment"' "${dir}/03-challenge.md"
grep -q '"kind": "finite-partition-allocation"' "${dir}/04-cross-check.md"
grep -Pq '"objectiveValue":\s*29' "${dir}/04-cross-check.md"
grep -Pq '"conclusion":\s*"[^"]*(?<!\d)29(?!\d)' "${dir}/05-conclusion.md"
grep -q '"mode": "exact-payload"' "${dir}/05-conclusion.md"

if [ "${ACCEPT_HOST}" = "claude" ]; then
  require_guard_hook_signal 'tool_dispatch_start tool=Skill'
  answer="$(awk '/^===== claude-debug-file =====$/{exit} {print}' "${ACCEPT_LOG}" | sed '/^[[:space:]]*$/d')"
else
  require_guard_hook_signal 'skills/reasoning-discipline/SKILL.md'
  answer="$(sed '/^[[:space:]]*$/d' "${ACCEPT_LOG}" | tail -1)"
fi
[ "${answer}" = "29" ] || { echo "expect fail: final answer must be exactly 29; got: ${answer}" >&2; exit 1; }
echo "OK explicit blind-draw workflow concluded 29"
