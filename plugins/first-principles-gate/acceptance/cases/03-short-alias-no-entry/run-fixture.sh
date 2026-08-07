#!/usr/bin/env bash
set -euo pipefail

CASE_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "${CASE_DIR}/../../.." && pwd)"
ENTRY="${PLUGIN_DIR}/scripts/first-principles-gate.mjs"
WS="${CASE_DIR}/workspace"
DATA="$(mktemp -d "${TMPDIR:-/tmp}/fp-accept-03-XXXXXX")"
export PLUGIN_DATA="${DATA}"
export CLAUDE_PLUGIN_DATA="${DATA}"
cleanup() { rm -rf "${DATA}"; }
trap cleanup EXIT

run_hook() {
  printf '%s' "$2" | node "${ENTRY}" "$1"
}

for prompt in '/fp 缓存' '$fp: auth' '/fp'; do
  SESSION="accept-03-$(printf '%s' "${prompt}" | tr -c 'A-Za-z0-9' '_')"
  ENTRY_OUT="$(run_hook prompt "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" --arg p "${prompt}" \
    '{cwd:$cwd,session_id:$s,prompt:$p}')")"
  if echo "${ENTRY_OUT}" | grep -q '第一性原理模式已开启'; then
    echo "FAIL short alias opened mode: ${prompt}" >&2
    echo "${ENTRY_OUT}" >&2
    exit 1
  fi
  PRE_OUT="$(run_hook pre "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" --arg path "${WS}/src/app.js" \
    '{cwd:$cwd,session_id:$s,tool_name:"Write",tool_input:{file_path:$path,content:"x\n"}}')")"
  if echo "${PRE_OUT}" | grep -q '"permissionDecision":"deny"'; then
    echo "FAIL short alias locked writes: ${prompt}" >&2
    echo "${PRE_OUT}" >&2
    exit 1
  fi
done

echo "OK 03-short-alias-no-entry"
