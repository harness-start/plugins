#!/usr/bin/env bash
# Offline fixture: valid ledger + done still Stop-blocks without challenger review.
set -euo pipefail

CASE_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "${CASE_DIR}/../../.." && pwd)"
ENTRY="${PLUGIN_DIR}/scripts/first-principles-gate.mjs"
WS="${CASE_DIR}/workspace"
DATA="$(mktemp -d "${TMPDIR:-/tmp}/fp-accept-07-XXXXXX")"
SESSION="accept-07-challenger"
export PLUGIN_DATA="${DATA}"
export CLAUDE_PLUGIN_DATA="${DATA}"

cleanup() { rm -rf "${DATA}" "${WS}/.first-principles"; }
trap cleanup EXIT

run_hook() {
  printf '%s' "$2" | node "${ENTRY}" "$1"
}

run_hook prompt "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,prompt:"/first-principles no reviewer"}')" >/dev/null

mkdir -p "${WS}/.first-principles"
jq -n '{
  schema: "first-principles/v1",
  status: "closed",
  question: "acceptance fixture question",
  assumptions: [{id:"A1", claim:"default is fine", status:"challenged"}],
  atoms: [{id:"F1", statement:"one measurable constraint", kind:"constraint", source:"given"}],
  rebuild: {options: [{id:"O1", conclusion:"keep barrier until review validates", derived_from:["F1"]}]},
  uncertainties: ["fixture only"]
}' > "${WS}/.first-principles/ledger.json"

run_hook post "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" --arg path "${WS}/.first-principles/ledger.json" \
  '{cwd:$cwd,session_id:$s,tool_name:"Write",tool_input:{file_path:$path}}')" >/dev/null

run_hook prompt "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,prompt:"done"}')" >/dev/null

STOP_OUT="$(run_hook stop "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,last_assistant_message:"First-principles analysis is complete"}')")"
echo "${STOP_OUT}" | grep -q '"decision":"block"' || {
  echo "FAIL expected Stop block without challenger review" >&2
  echo "${STOP_OUT}" >&2
  exit 1
}
echo "${STOP_OUT}" | grep -q 'FP_REVIEW_REQUEST challenger\|Independent challenger review' || {
  echo "FAIL block reason must name the independent challenger request" >&2
  echo "${STOP_OUT}" >&2
  exit 1
}

echo "OK 07-challenger-required"
