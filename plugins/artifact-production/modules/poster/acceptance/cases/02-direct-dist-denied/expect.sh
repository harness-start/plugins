#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal 'Poster Project Delivery Guard|PROTECTED_WRITER_REQUIRED|hook: PreToolUse'
if [ -e "${ACCEPT_WORKSPACE}/artifacts/poster/demo/dist/demo.main.png" ]; then
  echo "expect fail: protected poster output was written" >&2
  exit 1
fi
echo "OK direct poster dist write denied"
