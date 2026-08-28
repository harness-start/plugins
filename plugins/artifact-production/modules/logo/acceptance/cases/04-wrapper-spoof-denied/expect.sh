#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal 'Logo Project Delivery Guard.*UNKNOWN_MUTATION_SHELL|hook: PreToolUse'
if [ -e "${ACCEPT_WORKSPACE}/artifacts/logo/demo/dist/primary/mark.svg" ]; then
  echo "expect fail: wrapper substring spoof wrote protected logo output" >&2
  exit 1
fi
echo "OK wrapper substring spoof denied"
