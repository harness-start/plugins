#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal 'Video Project Delivery Guard.*UNKNOWN_MUTATION_SHELL|hook: PreToolUse'
if [ -e "${ACCEPT_WORKSPACE}/artifacts/video/demo/dist/demo.mp4" ]; then
  echo "expect fail: wrapper substring spoof wrote protected final MP4" >&2
  exit 1
fi
echo "OK wrapper substring spoof denied"
