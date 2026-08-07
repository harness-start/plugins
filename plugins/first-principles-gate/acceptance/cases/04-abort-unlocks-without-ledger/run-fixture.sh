#!/usr/bin/env bash
set -euo pipefail

CASE_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "${CASE_DIR}/../../.." && pwd)"
ENTRY="${PLUGIN_DIR}/scripts/first-principles-gate.mjs"
WS="${CASE_DIR}/workspace"
DATA="$(mktemp -d "${TMPDIR:-/tmp}/fp-accept-04-XXXXXX")"
SESSION="accept-04-abort"
export PLUGIN_DATA="${DATA}"
export CLAUDE_PLUGIN_DATA="${DATA}"
cleanup() { rm -rf "${DATA}"; }
trap cleanup EXIT

run_hook() {
  printf '%s' "$2" | node "${ENTRY}" "$1"
}

run_hook prompt "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,prompt:"/first-principles abort path"}')" >/dev/null

DENY="$(run_hook pre "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" --arg path "${WS}/src/app.js" \
  '{cwd:$cwd,session_id:$s,tool_name:"Write",tool_input:{file_path:$path,content:"x\n"}}')")"
echo "${DENY}" | grep -q '"permissionDecision":"deny"' || {
  echo "FAIL expected deny while open before abort" >&2
  exit 1
}

ABORT="$(run_hook prompt "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,prompt:"# first-principles-abort"}')")"
echo "${ABORT}" | grep -q 'write barrier is released\|aborted' || {
  echo "FAIL missing abort inject" >&2
  echo "${ABORT}" >&2
  exit 1
}

ALLOW="$(run_hook pre "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" --arg path "${WS}/src/app.js" \
  '{cwd:$cwd,session_id:$s,tool_name:"Write",tool_input:{file_path:$path,content:"y\n"}}')")"
if echo "${ALLOW}" | grep -q '"permissionDecision":"deny"'; then
  echo "FAIL residual deny after abort" >&2
  echo "${ALLOW}" >&2
  exit 1
fi

STOP="$(run_hook stop "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,last_assistant_message:"Aborted"}')")"
if echo "${STOP}" | grep -q '"decision":"block"'; then
  echo "FAIL abort path must not require ledger on stop" >&2
  echo "${STOP}" >&2
  exit 1
fi

echo "OK 04-abort-unlocks-without-ledger"
