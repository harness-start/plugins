#!/usr/bin/env bash
# Offline fixture: drive shipped hook entrypoints (no live model).
# Not used by honesty gate; invoked by CI unit path / manual verify.
set -euo pipefail

CASE_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "${CASE_DIR}/../../.." && pwd)"
ENTRY="${PLUGIN_DIR}/scripts/intent-clarify-gate.mjs"
WS="${CASE_DIR}/workspace"
DATA="$(mktemp -d "${TMPDIR:-/tmp}/icg-accept-XXXXXX")"
SESSION="accept-01-open-deny"
export PLUGIN_DATA="${DATA}"
export CLAUDE_PLUGIN_DATA="${DATA}"

cleanup() { rm -rf "${DATA}" "${WS}/.grill-ledgers"; }
trap cleanup EXIT

run_hook() {
  local mode="$1"
  local json="$2"
  printf '%s' "${json}" | node "${ENTRY}" "${mode}"
}

echo "==> entry /grill-me"
ENTRY_OUT="$(run_hook prompt "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,prompt:"/grill-me verify write barrier"}')")"
echo "${ENTRY_OUT}" | grep -q 'intent-clarify-gate' || {
  echo "FAIL missing open inject context" >&2
  echo "${ENTRY_OUT}" >&2
  exit 1
}

echo "==> session state must land in the project"
STATE_COUNT="$(find "${WS}/.grill-ledgers/.state" -name '*.json' 2>/dev/null | wc -l | tr -d ' ')"
[ "${STATE_COUNT}" -ge 1 ] || {
  echo "FAIL missing project session state under .grill-ledgers/.state" >&2
  exit 1
}
if [ -d "${DATA}/intent-clarify-gate" ]; then
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
echo "${DENY_OUT}" | grep -q 'intent-clarify-gate' || {
  echo "FAIL deny reason missing plugin id" >&2
  exit 1
}

echo "==> interpreter write of business path must deny"
NODE_OUT="$(run_hook pre "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,tool_name:"Bash",tool_input:{command:"node -e \"require('\''fs'\'').writeFileSync('\''src/app.js'\'','\''x'\'')\""}}')")"
echo "${NODE_OUT}" | grep -q '"permissionDecision":"deny"' || {
  echo "FAIL expected interpreter write deny" >&2
  echo "${NODE_OUT}" >&2
  exit 1
}

echo "==> bare done without a recorded decision must keep the barrier"
DONE_OUT="$(run_hook prompt "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,prompt:"done"}')")"
if echo "${DONE_OUT}" | grep -q 'write barrier is released\|interview is closed'; then
  echo "FAIL bare done released the write barrier" >&2
  echo "${DONE_OUT}" >&2
  exit 1
fi

echo "==> pre write after bare done must still deny"
STILL_DENY="$(run_hook pre "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" --arg path "${WS}/src/app.js" \
  '{cwd:$cwd,session_id:$s,tool_name:"Write",tool_input:{file_path:$path,content:"y\n"}}')")"
echo "${STILL_DENY}" | grep -q '"permissionDecision":"deny"' || {
  echo "FAIL expected residual deny after bare done" >&2
  echo "${STILL_DENY}" >&2
  exit 1
}

echo "OK intent-clarify-gate open-deny-then-complete fixture"
