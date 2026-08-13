#!/usr/bin/env bash
# Offline fixture: open → deny business write → valid ledger → done → stop pass → write allowed
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
  '{cwd:$cwd,session_id:$s,prompt:"/first-principles verify write barrier"}')")"
echo "${ENTRY_OUT}" | grep -q 'first-principles-gate' || {
  echo "FAIL missing open inject context" >&2
  echo "${ENTRY_OUT}" >&2
  exit 1
}
echo "${ENTRY_OUT}" | grep -q 'business writes are blocked' || {
  echo "FAIL missing write-block protocol text" >&2
  exit 1
}

echo "==> session state must land in the project"
STATE_COUNT="$(find "${WS}/.first-principles/.state" -name '*.json' 2>/dev/null | wc -l | tr -d ' ')"
[ "${STATE_COUNT}" -ge 1 ] || {
  echo "FAIL missing project session state under .first-principles/.state" >&2
  exit 1
}
if [ -d "${DATA}/first-principles-gate" ]; then
  echo "FAIL state still written to PLUGIN_DATA" >&2
  exit 1
fi

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

echo "==> independent challenger must bind before close"
run_hook pre "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,tool_name:"Agent",tool_input:{prompt:"FP_REVIEW_REQUEST challenger"}}')" >/dev/null
START_OUT="$(run_hook review-start "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,agent_id:"fp-challenger",agent_prompt:"FP_REVIEW_REQUEST challenger"}')")"
NONCE="$(printf '%s' "${START_OUT}" | sed -n 's/.*reviewNonce=\([a-f0-9][a-f0-9]*\).*/\1/p' | head -1)"
[ -n "${NONCE}" ] || {
  echo "FAIL missing challenger nonce" >&2
  echo "${START_OUT}" >&2
  exit 1
}
REVIEW_OUT="$(run_hook subagent-stop "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" --arg nonce "${NONCE}" \
  '{cwd:$cwd,session_id:$s,agent_id:"fp-challenger",last_assistant_message:("FP_REVIEW_RESULT {\"stage\":\"challenger\",\"reviewNonce\":\"" + $nonce + "\",\"decision\":\"approve\"}")}')")"
echo "${REVIEW_OUT}" | grep -q 'approve' || {
  echo "FAIL challenger approval was not recorded" >&2
  echo "${REVIEW_OUT}" >&2
  exit 1
}

echo "==> close with done"
DONE_OUT="$(run_hook prompt "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,prompt:"done"}')")"
echo "${DONE_OUT}" | grep -q 'write barrier is released\|session is closed' || {
  echo "FAIL missing close context" >&2
  echo "${DONE_OUT}" >&2
  exit 1
}

echo "==> stop with completion claim and valid ledger must pass"
STOP_OUT="$(run_hook stop "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,last_assistant_message:"First-principles analysis is complete"}')")"
if echo "${STOP_OUT}" | grep -q '"decision":"block"'; then
  echo "FAIL unexpected stop block with valid ledger" >&2
  echo "${STOP_OUT}" >&2
  exit 1
fi

echo "==> pre write after close must not deny"
ALLOW_OUT="$(run_hook pre "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" --arg path "${WS}/src/app.js" \
  '{cwd:$cwd,session_id:$s,tool_name:"Write",tool_input:{file_path:$path,content:"y\n"}}')")"
if echo "${ALLOW_OUT}" | grep -q '"permissionDecision":"deny"'; then
  echo "FAIL residual deny after done" >&2
  echo "${ALLOW_OUT}" >&2
  exit 1
fi

echo "OK 01-open-deny-then-ledger-complete"
