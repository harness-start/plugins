#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
manifest="$(find "${ACCEPT_WORKSPACE}/.research/runs" -name research.json -type f -print -quit)"
[ -n "${manifest}" ] && jq -e '.schema == "research-manifest/v1" and .claims[0].status == "anchored" and (.integrity.seal | startswith("sha256:"))' "${manifest}" >/dev/null
jq -e '.phase == "complete" and .completeness.sealed == true' "$(dirname "${manifest}")/workflow.json" >/dev/null
require_research_seal_receipt "${manifest}"
require_guard_hook_signal '\[Research Provenance Guard\]|Research-Evidence: research-evidence/v1|Validating research evidence seal'
test -d "${ACCEPT_WORKSPACE}/.research/state"
test ! -d "${ACCEPT_WORKSPACE}/.research/.state"
test "$(cat "${ACCEPT_WORKSPACE}/.research/.gitignore")" = "*"
test "$(cat "${ACCEPT_WORKSPACE}/.gitignore")" = "vendor/"
echo "OK workspace source was anchored and sealed"
