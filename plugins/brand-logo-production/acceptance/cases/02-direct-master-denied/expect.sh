#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal 'Logo Project Delivery Guard|PROTECTED_WRITER_REQUIRED|hook: PreToolUse'
if [ -e "${ACCEPT_WORKSPACE}/artifacts/logo/demo/build/master/mark.svg" ]; then
  echo "expect fail: protected logo master was written" >&2
  exit 1
fi
echo "OK direct logo master write denied"
