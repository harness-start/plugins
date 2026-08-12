#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'Standing rule: proof, exact, worst-case'
require_guard_hook_signal "${MARKERS_REASONING_DISCIPLINE}"
workflow="$(find "${ACCEPT_WORKSPACE}/.reasoning-discipline" -mindepth 2 -maxdepth 2 -name workflow.md -type f | head -1)"
[ -n "${workflow}" ] || { echo "expect fail: auto-route did not create a reasoning workflow" >&2; exit 1; }
dir="$(dirname "${workflow}")"
grep -q '"status": "closed"' "${workflow}"
grep -q '"answerBinding": "supporting"' "${dir}/04-cross-check.md"
grep -Pq '"objectiveValue":\s*[0-9]+' "${dir}/04-cross-check.md"
grep -Pq '"conclusion":\s*"stable-partition"' "${dir}/05-conclusion.md"
grep -q '"mode": "exact-payload"' "${dir}/05-conclusion.md"

if [ "${ACCEPT_HOST}" = "claude" ]; then
  answer="$(awk '/^===== claude-debug-file =====$/{exit} {print}' "${ACCEPT_LOG}" | sed '/^[[:space:]]*$/d')"
elif [ "${ACCEPT_HOST}" = "codex" ]; then
  answer="$(sed '/^[[:space:]]*$/d' "${ACCEPT_LOG}" | tail -1)"
else
  echo "expect fail: unsupported host ${ACCEPT_HOST}" >&2
  exit 1
fi
[ "${answer}" = "stable-partition" ] || { echo "expect fail: semantic answer was replaced: ${answer}" >&2; exit 1; }
echo "OK supporting metric preserved the semantic policy conclusion"
