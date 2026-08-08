#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal 'Active research runs must use source_discover|direct Firecrawl CLI calls are blocked|PreToolUse Blocked|Hook denied tool use'
manifest="$(find "${ACCEPT_WORKSPACE}/.research/runs" -name research.json -type f -print -quit)"
[ -n "${manifest}" ] && jq -e '.claims[0].status == "unverified"' "${manifest}" >/dev/null
require_research_seal_receipt "${manifest}"
echo "OK direct Firecrawl was denied and recovered through a sealed limitation"
