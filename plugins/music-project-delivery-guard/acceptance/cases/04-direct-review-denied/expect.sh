#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal 'Music Project Delivery Guard|PROTECTED_WRITER_REQUIRED|hook: PreToolUse'
if [ -e "${ACCEPT_WORKSPACE}/artifacts/music/demo/review.music.json" ]; then
  echo "expect fail: protected music review was written directly" >&2
  exit 1
fi
echo "OK direct music review write denied"
