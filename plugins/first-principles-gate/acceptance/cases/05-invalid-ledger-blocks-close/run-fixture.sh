#!/usr/bin/env bash
set -euo pipefail

CASE_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "${CASE_DIR}/../../.." && pwd)"
ENTRY="${PLUGIN_DIR}/scripts/first-principles-gate.mjs"
WS="${CASE_DIR}/workspace"
DATA="$(mktemp -d "${TMPDIR:-/tmp}/fp-accept-05-XXXXXX")"
SESSION="accept-05-invalid-ledger"
export PLUGIN_DATA="${DATA}"
export CLAUDE_PLUGIN_DATA="${DATA}"
cleanup() { rm -rf "${DATA}" "${WS}/.first-principles"; }
trap cleanup EXIT

run_hook() {
  printf '%s' "$2" | node "${ENTRY}" "$1"
}

run_hook prompt "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,prompt:"/first-principles invalid ledger"}')" >/dev/null

mkdir -p "${WS}/.first-principles"
# Present but structurally invalid: unknown atom id + empty uncertainties
jq -n '{
  schema: "first-principles/v1",
  question: "broken fixture",
  assumptions: [{id:"A1", claim:"x"}],
  atoms: [{id:"F1", statement:"y"}],
  rebuild: {options: [{id:"O1", conclusion:"z", derived_from:["MISSING"]}]},
  uncertainties: []
}' > "${WS}/.first-principles/ledger.json"

STOP="$(run_hook stop "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,last_assistant_message:"第一性原理分析已完成"}')")"
echo "${STOP}" | grep -q '"decision":"block"' || {
  echo "FAIL expected Stop block for invalid ledger" >&2
  echo "${STOP}" >&2
  exit 1
}
echo "${STOP}" | grep -Eq 'unknown atom id|uncertainties|findings' || {
  echo "FAIL block reason missing structural findings" >&2
  echo "${STOP}" >&2
  exit 1
}

echo "OK 05-invalid-ledger-blocks-close"
