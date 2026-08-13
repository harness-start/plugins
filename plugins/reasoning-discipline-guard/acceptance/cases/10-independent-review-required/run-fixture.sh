#!/usr/bin/env bash
# Offline fixture: a parent-authored challenge file does not receive RD-R3.
set -euo pipefail

CASE_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "${CASE_DIR}/../../.." && pwd)"
ENTRY="${PLUGIN_DIR}/scripts/reasoning-discipline-guard.mjs"
ROOT="$(mktemp -d "${TMPDIR:-/tmp}/rd-accept-10-XXXXXX")"
DATA="$(mktemp -d "${TMPDIR:-/tmp}/rd-accept-10-data-XXXXXX")"
SESSION="accept-10-review"
export PLUGIN_DATA="${DATA}"

cleanup() { rm -rf "${ROOT}" "${DATA}"; }
trap cleanup EXIT

git -C "${ROOT}" init -q
DIR="${ROOT}/.reasoning-discipline/20260813-review"
mkdir -p "${DIR}"

run_hook() {
  printf '%s' "$2" | node "${ENTRY}" "$1"
}

write_json_md() {
  local path="$1"
  local schema="$2"
  local label="$3"
  local payload="$4"
  printf '# %s\n\n```json %s\n%s\n```\n' "${label}" "${schema}" "${payload}" > "${path}"
}

MANIFEST='{"schema":"reasoning-workflow/v1","id":"RW-20260813-review","status":"open","branch":"causal","question":"Why did the cache collide?","successCriteria":["name the cause"],"run":{"epoch":1},"currentStage":"frame","completionReceipt":null,"resume":{"nextStage":"frame","nextAction":"record observations"}}'
write_json_md "${DIR}/workflow.md" "reasoning-workflow/v1" "Workflow" "${MANIFEST}"
run_hook post "$(jq -nc --arg cwd "${ROOT}" --arg s "${SESSION}" --arg path "${DIR}/workflow.md" \
  '{cwd:$cwd,session_id:$s,tool_name:"Write",tool_input:{file_path:$path}}')" | grep -q 'Bound RW-20260813-review'

FRAME='{"schema":"reasoning-stage/v1","workflowId":"RW-20260813-review","branch":"causal","stage":"frame","previousReceipt":null,"payload":{"givens":[{"id":"G1","statement":"keys collide after normalize","source":"given"}],"assumptions":[{"id":"A1","statement":"normalize is shared","source":"inferred","falsifier":"paths differ"}],"ambiguities":[{"id":"U1","statement":"whether order matters","impact":"changes the cause","resolution":"keep both keys"}],"strategyVariables":[]}}'
write_json_md "${DIR}/01-frame.md" "reasoning-stage/v1" "frame" "${FRAME}"
run_hook post "$(jq -nc --arg cwd "${ROOT}" --arg s "${SESSION}" --arg path "${DIR}/01-frame.md" \
  '{cwd:$cwd,session_id:$s,tool_name:"Write",tool_input:{file_path:$path}}')" | grep -q 'RD-R1'

ANALYSIS='{"schema":"reasoning-stage/v1","workflowId":"RW-20260813-review","branch":"causal","stage":"analysis","previousReceipt":"RD-R1","payload":{"observations":[{"id":"O1","statement":"collisions appear after normalize","source":"observed"}],"hypotheses":[{"id":"H1","claim":"normalize collides","falsifier":"distinct keys","status":"supported","evidenceRefs":["O1"]},{"id":"H2","claim":"rows are missing","falsifier":"rows exist","status":"falsified","evidenceRefs":["O1"]}],"discriminatingTests":[{"id":"T1","statement":"compare raw and normalized keys","outcome":"H1 supported"}],"candidateCause":"normalize collision","derivations":[{"id":"D1","claim":"normalize is causal","dependsOn":["O1","H1","T1"]}]}}'
write_json_md "${DIR}/02-analysis.md" "reasoning-stage/v1" "analysis" "${ANALYSIS}"
run_hook post "$(jq -nc --arg cwd "${ROOT}" --arg s "${SESSION}" --arg path "${DIR}/02-analysis.md" \
  '{cwd:$cwd,session_id:$s,tool_name:"Write",tool_input:{file_path:$path}}')" | grep -q 'RD-R2'

CHALLENGE='{"schema":"reasoning-stage/v1","workflowId":"RW-20260813-review","branch":"causal","stage":"challenge","previousReceipt":"RD-R2","payload":{"attacks":[{"id":"X1","targetRef":"D1","kind":"alternate-hypothesis","test":"try the missing-row story","outcome":"refuted","evidence":"rows are present"}],"revisions":[]}}'
write_json_md "${DIR}/03-challenge.md" "reasoning-stage/v1" "challenge" "${CHALLENGE}"
UNSIGNED="$(run_hook post "$(jq -nc --arg cwd "${ROOT}" --arg s "${SESSION}" --arg path "${DIR}/03-challenge.md" \
  '{cwd:$cwd,session_id:$s,tool_name:"Write",tool_input:{file_path:$path}}')")"
echo "${UNSIGNED}" | grep -q 'independent challenge review is missing or stale' || {
  echo "FAIL expected independent review requirement" >&2
  echo "${UNSIGNED}" >&2
  exit 1
}
echo "${UNSIGNED}" | grep -q 'RD-R3' && {
  echo "FAIL challenge was signed without a reviewer" >&2
  echo "${UNSIGNED}" >&2
  exit 1
}

echo "OK 10-independent-review-required"
