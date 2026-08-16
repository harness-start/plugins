#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
manifest="$(find "${ACCEPT_WORKSPACE}/.research/runs" -name research.json -type f -print -quit)"
[ -n "${manifest}" ] && jq -e '.claims[0].status == "unverified" and .claims[0].limitation == "No production telemetry was supplied."' "${manifest}" >/dev/null
jq -e '.phase == "complete" and .completeness.sealed == true' "$(dirname "${manifest}")/workflow.json" >/dev/null
require_research_seal_receipt "${manifest}"
require_guard_hook_signal '\[Research Provenance Guard\]|Research-Evidence: research-evidence/v1|Validating research evidence seal'
echo "OK unverified claim retained an explicit limitation"
