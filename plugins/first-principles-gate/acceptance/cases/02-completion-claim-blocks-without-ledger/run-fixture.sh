#!/usr/bin/env bash
set -euo pipefail

CASE_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "${CASE_DIR}/../../.." && pwd)"
ENTRY="${PLUGIN_DIR}/scripts/first-principles-gate.mjs"
WS="${CASE_DIR}/workspace"
DATA="$(mktemp -d "${TMPDIR:-/tmp}/fp-accept-02-XXXXXX")"
SESSION="accept-02-claim-block"
export PLUGIN_DATA="${DATA}"
export CLAUDE_PLUGIN_DATA="${DATA}"
cleanup() { rm -rf "${DATA}"; }
trap cleanup EXIT

run_hook() {
  printf '%s' "$2" | node "${ENTRY}" "$1"
}

run_hook prompt "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,prompt:"/first-principles no ledger"}')" >/dev/null

STOP_OUT="$(run_hook stop "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" \
  '{cwd:$cwd,session_id:$s,last_assistant_message:"First-principles analysis is complete."}')")"
echo "${STOP_OUT}" | grep -q '"decision":"block"' || {
  echo "FAIL expected Stop block without ledger" >&2
  echo "${STOP_OUT}" >&2
  exit 1
}
echo "${STOP_OUT}" | grep -q 'first-principles-gate\|ledger' || {
  echo "FAIL block reason missing plugin/ledger identity" >&2
  exit 1
}
echo "OK 02-completion-claim-blocks-without-ledger"
