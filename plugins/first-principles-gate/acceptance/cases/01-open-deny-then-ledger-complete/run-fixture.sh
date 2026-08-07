#!/usr/bin/env bash
# Offline fixture: open → deny business write → valid ledger → 完成 → stop pass → write allowed
set -euo pipefail

CASE_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "${CASE_DIR}/../../.." && pwd)"
ENTRY="${PLUGIN_DIR}/scripts/first-principles-gate.mjs"
WS="${CASE_DIR}/workspace"
DATA="$(mktemp -d "${TMPDIR:-/tmp}/fp-accept-01-XXXXXX")"
SESSION="accept-01-open-deny-ledger"
export PLUGIN_DATA="${DATA}"
export CLAUDE_PLUGIN_DATA="${DATA}"

cleanup() { rm -rf "${DATA}" "${WS}/.first-principles"; }
trap cleanup EXIT

run_hook() {
  local mode="$1"
  local json="$2"
  printf '%s' "${json}" | node "${ENTRY}" "${mode}"
}

echo "==> entry /first-principles"
ENTRY_OUT="$(run_hook prompt "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,prompt:"/first-principles 验收写屏障"}')")"
echo "${ENTRY_OUT}" | grep -q 'first-principles-gate' || {
  echo "FAIL missing open inject context" >&2
  echo "${ENTRY_OUT}" >&2
  exit 1
}
echo "${ENTRY_OUT}" | grep -q '业务写入已拦截' || {
  echo "FAIL missing write-block protocol text" >&2
  exit 1
}

echo "==> pre write business path must deny"
DENY_OUT="$(run_hook pre "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" --arg path "${WS}/src/app.js" \
  '{cwd:$cwd,session_id:$s,tool_name:"Write",tool_input:{file_path:$path,content:"x\n"}}')")"
echo "${DENY_OUT}" | grep -q '"permissionDecision":"deny"' || {
  echo "FAIL expected PreToolUse deny signal" >&2
  echo "${DENY_OUT}" >&2
  exit 1
}

echo "==> short alias /fp must NOT be treated as entry in parallel idle check"
# (documented negative surface; full case lives in 03)

echo "==> write valid ledger under allowlist"
mkdir -p "${WS}/.first-principles"
jq -n '{
  schema: "first-principles/v1",
  status: "closed",
  question: "acceptance fixture question",
  assumptions: [{id:"A1", claim:"default is fine", status:"challenged"}],
  atoms: [{id:"F1", statement:"one measurable constraint", kind:"constraint", source:"given"}],
  rebuild: {options: [{id:"O1", conclusion:"keep barrier until ledger validates", derived_from:["F1"]}]},
  uncertainties: ["fixture only"]
}' > "${WS}/.first-principles/ledger.json"

ALLOW_LEDGER="$(run_hook pre "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" --arg path "${WS}/.first-principles/ledger.json" \
  '{cwd:$cwd,session_id:$s,tool_name:"Write",tool_input:{file_path:$path,content:"{}"}}')")"
if echo "${ALLOW_LEDGER}" | grep -q '"permissionDecision":"deny"'; then
  echo "FAIL ledger path should be writable while open" >&2
  echo "${ALLOW_LEDGER}" >&2
  exit 1
fi

# Credit session-bound revision via PostToolUse (mtime also works; both exercised).
run_hook post "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" --arg path "${WS}/.first-principles/ledger.json" \
  '{cwd:$cwd,session_id:$s,tool_name:"Write",tool_input:{file_path:$path,content:"{}"}}')" >/dev/null


echo "==> close with 完成"
DONE_OUT="$(run_hook prompt "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,prompt:"完成"}')")"
echo "${DONE_OUT}" | grep -q '写屏障已解除\|会话已结束' || {
  echo "FAIL missing close context" >&2
  echo "${DONE_OUT}" >&2
  exit 1
}

echo "==> stop with completion claim and valid ledger must pass"
STOP_OUT="$(run_hook stop "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,last_assistant_message:"第一性原理分析已完成"}')")"
if echo "${STOP_OUT}" | grep -q '"decision":"block"'; then
  echo "FAIL unexpected stop block with valid ledger" >&2
  echo "${STOP_OUT}" >&2
  exit 1
fi

echo "==> pre write after close must not deny"
ALLOW_OUT="$(run_hook pre "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" --arg path "${WS}/src/app.js" \
  '{cwd:$cwd,session_id:$s,tool_name:"Write",tool_input:{file_path:$path,content:"y\n"}}')")"
if echo "${ALLOW_OUT}" | grep -q '"permissionDecision":"deny"'; then
  echo "FAIL residual deny after 完成" >&2
  echo "${ALLOW_OUT}" >&2
  exit 1
fi

echo "OK 01-open-deny-then-ledger-complete"
