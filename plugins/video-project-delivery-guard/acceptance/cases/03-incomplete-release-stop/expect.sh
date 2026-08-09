#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal 'Video Project Delivery Guard.*Project contract violations|hook: Stop'
grep -Eq 'REQUIRED_PATH_MISSING|RELEASE_PATH_MISSING' "${ACCEPT_LOG}"
echo "OK incomplete video release was blocked at Stop"
