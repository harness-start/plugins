#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal 'Training Program Delivery Guard|PROTECTED_WRITER_REQUIRED|hook: PreToolUse'
test ! -e "${ACCEPT_WORKSPACE}/artifacts/training/demo/dist/facilitator-guide.md"
echo "OK direct generated training write denied"
