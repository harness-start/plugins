#!/usr/bin/env bash
set -euo pipefail
CASE_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "${CASE_DIR}/../../.." && pwd)"
ENTRY="${PLUGIN_DIR}/scripts/goal-task-gate.mjs"
WS="${CASE_DIR}/workspace"
DATA="$(mktemp -d "${TMPDIR:-/tmp}/gtg-02-XXXXXX")"
SESSION="accept-02-deny"
export PLUGIN_DATA="${DATA}"
export CLAUDE_PLUGIN_DATA="${DATA}"
cleanup() { rm -rf "${DATA}" "${WS}/.goal-task" "${WS}/.gitignore" "${WS}/.git"; }
trap cleanup EXIT
rm -rf "${WS}/.git" "${WS}/.goal-task"
git -C "${WS}" init -q
run_hook() { printf '%s' "$2" | node "${ENTRY}" "$1"; }
run_hook prompt "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,prompt:"/goal protect trail"}')" >/dev/null
RUN="$(cat "${WS}/.goal-task/CURRENT")"
DENY="$(run_hook pre "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  --arg path "${WS}/.goal-task/runs/${RUN}/decisions.tsv" \
  '{cwd:$cwd,session_id:$s,tool_name:"Write",tool_input:{file_path:$path,content:"hack\n"}}')")"
echo "${DENY}" | grep -q '"permissionDecision":"deny"' || { echo "FAIL deny" >&2; echo "${DENY}" >&2; exit 1; }
# compound shell with helper name still denied
SHELL_DENY="$(run_hook pre "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  --arg cmd "rm -f ${WS}/.goal-task/runs/${RUN}/decisions.tsv; echo log-decision.mjs" \
  '{cwd:$cwd,session_id:$s,tool_name:"Bash",tool_input:{command:$cmd}}')")"
echo "${SHELL_DENY}" | grep -q '"permissionDecision":"deny"' || { echo "FAIL shell compound" >&2; echo "${SHELL_DENY}" >&2; exit 1; }
echo "OK"
