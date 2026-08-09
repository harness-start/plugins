#!/usr/bin/env bash
set -euo pipefail
CASE_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "${CASE_DIR}/../../.." && pwd)"
ENTRY="${PLUGIN_DIR}/scripts/goal-task-gate.mjs"
WS="${CASE_DIR}/workspace"
DATA="$(mktemp -d "${TMPDIR:-/tmp}/gtg-03-XXXXXX")"
SESSION="accept-03-trailer"
export PLUGIN_DATA="${DATA}"
export CLAUDE_PLUGIN_DATA="${DATA}"
cleanup() { rm -rf "${DATA}" "${WS}/.goal-task" "${WS}/.git"; }
trap cleanup EXIT
rm -rf "${WS}/.git" "${WS}/.goal-task"
git -C "${WS}" init -q
run_hook() { printf '%s' "$2" | node "${ENTRY}" "$1"; }
run_hook prompt "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,prompt:"/goal trailer check"}')" >/dev/null
RUN="$(cat "${WS}/.goal-task/CURRENT")"
BLOCK="$(run_hook stop "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" --arg r "${RUN}" \
  '{cwd:$cwd,session_id:$s,last_assistant_message:("All done.\nGOAL_TASK_DONE run_id=" + $r + " status=completed close_seq=99 tip_hash=deadbeefdeadbeef\n")}')")"
echo "${BLOCK}" | grep -q '"decision":"block"' || { echo "FAIL stop block" >&2; echo "${BLOCK}" >&2; exit 1; }
echo "OK"
