#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal 'Diagram Project Delivery Guard|PROTECTED_OUTPUT_WRITE|hook: PreToolUse'
if [ -e "${ACCEPT_WORKSPACE}/artifacts/diagram/demo/dist/demo.svg" ]; then
  echo "expect fail: protected diagram output was written" >&2
  exit 1
fi
echo "OK direct diagram dist write denied"
