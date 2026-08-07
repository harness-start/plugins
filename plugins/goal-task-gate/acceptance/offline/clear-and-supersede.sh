#!/usr/bin/env bash
# Offline-only lifecycle checks (not host acceptance cases).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENTRY="${ROOT}/scripts/goal-task-gate.mjs"
WS="$(mktemp -d "${TMPDIR:-/tmp}/gtg-offline-XXXXXX")"
DATA="$(mktemp -d "${TMPDIR:-/tmp}/gtg-offline-data-XXXXXX")"
export PLUGIN_DATA="${DATA}" CLAUDE_PLUGIN_DATA="${DATA}"
cleanup() { rm -rf "${WS}" "${DATA}"; }
trap cleanup EXIT
git -C "${WS}" init -q
run() { printf '%s' "$2" | node "${ENTRY}" "$1"; }
SESSION=offline-life
run prompt "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" '{cwd:$cwd,session_id:$s,prompt:"/goal first"}')" >/dev/null
OLD="$(cat "${WS}/.goal-task/CURRENT")"
run prompt "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" '{cwd:$cwd,session_id:$s,prompt:"/goal second"}')" | grep -q superseded
NEW="$(cat "${WS}/.goal-task/CURRENT")"
test "${OLD}" != "${NEW}"
grep -q '"status": "superseded"' "${WS}/.goal-task/runs/${OLD}/meta.json"
run prompt "$(jq -nc --arg cwd "${WS}" --arg s "${SESSION}" '{cwd:$cwd,session_id:$s,prompt:"/goal clear"}')" | grep -q cleared
test -z "$(tr -d '[:space:]' < "${WS}/.goal-task/CURRENT")"
echo "OK offline clear+supersede"
