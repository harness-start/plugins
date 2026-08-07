#!/usr/bin/env bash
set -euo pipefail

CASE_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "${CASE_DIR}/../../.." && pwd)"
ENTRY="${PLUGIN_DIR}/scripts/first-principles-gate.mjs"
WS="${CASE_DIR}/workspace"
DATA="$(mktemp -d "${TMPDIR:-/tmp}/fp-accept-06-XXXXXX")"
SESSION="accept-06-soft"
export PLUGIN_DATA="${DATA}"
export CLAUDE_PLUGIN_DATA="${DATA}"
cleanup() { rm -rf "${DATA}"; }
trap cleanup EXIT

run_hook() {
  printf '%s' "$2" | node "${ENTRY}" "$1"
}

run_hook prompt "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,prompt:"/first-principles soft report"}')" >/dev/null

STOP="$(run_hook stop "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,last_assistant_message:"正在列假设，下一轮写 atoms。"}')")"
if echo "${STOP}" | grep -q '"decision":"block"'; then
  echo "FAIL mid-turn must soft-report, not block" >&2
  echo "${STOP}" >&2
  exit 1
fi
echo "${STOP}" | grep -Eq 'soft report|尚未完整' || {
  echo "FAIL missing soft report context" >&2
  echo "${STOP}" >&2
  exit 1
}

DENY="$(run_hook pre "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" --arg path "${WS}/src/app.js" \
  '{cwd:$cwd,session_id:$s,tool_name:"Write",tool_input:{file_path:$path,content:"x\n"}}')")"
echo "${DENY}" | grep -q '"permissionDecision":"deny"' || {
  echo "FAIL write barrier must remain while open after soft report" >&2
  echo "${DENY}" >&2
  exit 1
}

echo "OK 06-soft-report-while-open"
