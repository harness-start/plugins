#!/usr/bin/env bash
set -euo pipefail
CASE_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "${CASE_DIR}/../../.." && pwd)"
ENTRY="${PLUGIN_DIR}/scripts/goal-task-gate.mjs"
WS="${CASE_DIR}/workspace"
DATA="$(mktemp -d "${TMPDIR:-/tmp}/gtg-01-XXXXXX")"
SESSION="accept-01-arm"
export PLUGIN_DATA="${DATA}"
export CLAUDE_PLUGIN_DATA="${DATA}"
cleanup() { rm -rf "${DATA}" "${WS}/.goal-task" "${WS}/.git"; }
trap cleanup EXIT
rm -rf "${WS}/.git" "${WS}/.goal-task"
git -C "${WS}" init -q
run_hook() { printf '%s' "$2" | node "${ENTRY}" "$1"; }
echo "==> /goal arms and injects protocol"
OUT="$(run_hook prompt "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,prompt:"/goal all tests pass"}')")"
echo "${OUT}" | grep -q 'goal-task-gate' || { echo "FAIL inject" >&2; echo "${OUT}" >&2; exit 1; }
echo "${OUT}" | grep -q 'GOAL_TASK_DONE' || { echo "FAIL trailer template" >&2; exit 1; }
test -f "${WS}/.goal-task/CURRENT" || { echo "FAIL CURRENT" >&2; exit 1; }
RUN="$(cat "${WS}/.goal-task/CURRENT")"
test -f "${WS}/.goal-task/runs/${RUN}/decisions.tsv" || { echo "FAIL decisions" >&2; exit 1; }
echo "OK"
