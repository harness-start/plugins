#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal "R8_BROAD_KEEP"
test "$(tr -d '\r\n' < "${ACCEPT_WORKSPACE}/proguard-rules.pro")" = '-keep class ** { *; }'
echo "OK advisory source scan reported without blocking the write"
