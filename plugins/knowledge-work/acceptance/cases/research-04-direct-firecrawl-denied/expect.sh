#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal "host's built-in web search for discovery|direct Firecrawl CLI calls are blocked|PreToolUse Blocked|Hook denied tool use"
manifest="$(find "${ACCEPT_WORKSPACE}/.research/runs" -name research.json -type f -print -quit)"
[ -n "${manifest}" ] && jq -e '.claims[0].status == "unverified"' "${manifest}" >/dev/null
jq -e '.phase == "complete" and .completeness.sealed == true' "$(dirname "${manifest}")/workflow.json" >/dev/null
require_research_seal_receipt "${manifest}"
echo "OK external Firecrawl was denied and host-native discovery remained the only search path"
