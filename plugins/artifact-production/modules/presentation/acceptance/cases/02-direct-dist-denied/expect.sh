#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal 'PPTX Project Delivery Guard|PROTECTED_WRITER_REQUIRED|hook: PreToolUse'
if [ -e "${ACCEPT_WORKSPACE}/artifacts/pptx/demo/dist/demo.pptx" ]; then
  echo "expect fail: protected PPTX output was written" >&2
  exit 1
fi
echo "OK direct PPTX dist write denied"
