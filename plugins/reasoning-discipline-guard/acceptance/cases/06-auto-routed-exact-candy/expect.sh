#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'Proof-sensitive work'
require_guard_hook_signal "${MARKERS_REASONING_DISCIPLINE}"

workflow="$(find "${ACCEPT_WORKSPACE}/.reasoning-discipline" -mindepth 2 -maxdepth 2 -name workflow.md -type f | head -1)"
[ -n "${workflow}" ] || { echo "expect fail: auto-route did not create a reasoning workflow" >&2; exit 1; }
grep -q '"status": "closed"' "${workflow}"
grep -q '"completionReceipt": "RD-R5"' "${workflow}"

dir="$(dirname "${workflow}")"
for file in 01-frame.md 02-analysis.md 03-challenge.md 04-cross-check.md 05-conclusion.md; do
  require_file_exists "${dir}/${file}"
done
grep -q '"kind": "exists"' "${dir}/02-analysis.md"
grep -q '"kind": "forall"' "${dir}/02-analysis.md"
grep -q '"controlAssignments"' "${dir}/01-frame.md"
grep -q '"kind": "allocation"' "${dir}/01-frame.md"
grep -q '"controlEffect": "allocation"' "${dir}/01-frame.md"
grep -q '"kind": "quantifier-order"' "${dir}/03-challenge.md"
grep -q '"kind": "control-assignment"' "${dir}/03-challenge.md"
grep -q '"kind": "finite-partition-allocation"' "${dir}/04-cross-check.md"
grep -Pq '"objectiveValue":\s*21' "${dir}/04-cross-check.md"
grep -Pq '"conclusion":\s*"[^"]*(?<!\d)21(?!\d)' "${dir}/05-conclusion.md"
grep -q '"mode": "exact-payload"' "${dir}/05-conclusion.md"

if [ "${ACCEPT_HOST}" = "claude" ]; then
  require_guard_hook_signal 'tool_dispatch_start tool=Skill'
  answer="$(awk '/^===== claude-debug-file =====$/{exit} {print}' "${ACCEPT_LOG}" | sed '/^[[:space:]]*$/d')"
elif [ "${ACCEPT_HOST}" = "codex" ]; then
  require_guard_hook_signal 'skills/reasoning-discipline/SKILL.md'
  answer="$(sed '/^[[:space:]]*$/d' "${ACCEPT_LOG}" | tail -1)"
else
  echo "expect fail: unsupported host ${ACCEPT_HOST}" >&2
  exit 1
fi

if [ "${answer}" != "21" ]; then
  echo "expect fail: final answer must be exactly 21; got: ${answer}" >&2
  exit 1
fi

echo "OK SessionStart auto-routed exact candy through a closed workflow with answer 21"
