#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal 'Tone.js Music Production.*Project contract violations|hook: Stop'
grep -Eq 'REQUIRED_PATH_MISSING|RELEASE_PATH_MISSING|hook: Stop Blocked' "${ACCEPT_LOG}"
echo "OK incomplete music release was blocked at Stop"
