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

cleanup() { rm -rf "${DATA}"; }
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

echo "==> close with done"
DONE_OUT="$(run_hook prompt "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,prompt:"done"}')")"
echo "${DONE_OUT}" | grep -q 'write barrier is released\|interview is closed' || {
  echo "FAIL missing close context" >&2
  echo "${DONE_OUT}" >&2
  exit 1
}

echo "==> pre write after close must not deny"
ALLOW_OUT="$(run_hook pre "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" --arg path "${WS}/src/app.js" \
  '{cwd:$cwd,session_id:$s,tool_name:"Write",tool_input:{file_path:$path,content:"y\n"}}')")"
if echo "${ALLOW_OUT}" | grep -q '"permissionDecision":"deny"'; then
  echo "FAIL residual deny after done" >&2
  echo "${ALLOW_OUT}" >&2
  exit 1
fi

echo "OK intent-clarify-gate open-deny-then-complete fixture"
