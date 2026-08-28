#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal 'hook: Stop|Training Program Delivery Guard'
grep -Fq 'ordinary answer' "${ACCEPT_LOG}"
test ! -e "${ACCEPT_WORKSPACE}/artifacts/training"
echo "OK ordinary answer bypassed training hard scope"
