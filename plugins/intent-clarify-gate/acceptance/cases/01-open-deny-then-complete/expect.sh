#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

# Host-session honesty: must fail-closed on inert logs (no real hooks).
# Offline fixture proof: INTENT_CLARIFY_FIXTURE=1 bash run-fixture.sh
require_host_session_started
require_guard_hook_signal "${MARKERS_INTENT_CLARIFY}|${MARKERS_HOOK_DENY}"
echo "OK intent-clarify-gate host deny/close signal present"
