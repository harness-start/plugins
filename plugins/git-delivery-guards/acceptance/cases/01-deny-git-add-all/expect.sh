#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
git -C "${ACCEPT_WORKSPACE}" diff --cached --quiet
require_guard_hook_signal "${MARKERS_GIT_ADD}|${MARKERS_HOOK_DENY}"
echo "OK git-delivery bulk staging deny"
