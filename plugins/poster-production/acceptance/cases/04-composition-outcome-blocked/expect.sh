#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal 'Poster Project Delivery Guard.*Project contract violations|hook: Stop'
if [ "${ACCEPT_HOST}" = "claude" ]; then
  grep -Fq 'COMPOSITION_EVIDENCE_INVALID' "${ACCEPT_LOG}"
else
  grep -Fq 'hook: Stop Blocked' "${ACCEPT_LOG}"
fi
echo "OK poster release was blocked without measured composition outcome evidence"
