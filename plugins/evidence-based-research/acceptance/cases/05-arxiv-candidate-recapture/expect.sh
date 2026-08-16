#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
manifest="$(find "${ACCEPT_WORKSPACE}/.research/runs" -name research.json -type f -print -quit)"
[ -n "${manifest}" ] && jq -e '
  .sources[0].kind == "workspace"
  and .sources[0].workspace_path == "arxiv-candidate.txt"
  and .anchors[0].source_id == .sources[0].source_id
  and .claims[0].status == "anchored"
' "${manifest}" >/dev/null
jq -e '.phase == "complete" and .completeness.sealed == true' "$(dirname "${manifest}")/workflow.json" >/dev/null
require_research_seal_receipt "${manifest}"
require_guard_hook_signal '\[Research Provenance Guard\]|Research-Evidence: research-evidence/v1|Validating research evidence seal'
echo "OK arxiv candidate output was recaptured before claim anchoring"
