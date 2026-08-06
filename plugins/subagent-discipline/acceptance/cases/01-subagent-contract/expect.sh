#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal "${MARKERS_SUBAGENT_DISCIPLINE}"

if [ -n "$(git -C "${ACCEPT_WORKSPACE}" status --porcelain)" ]; then
  echo "expect fail: acceptance workspace was modified" >&2
  exit 1
fi

echo "OK subagent discipline contract injected"
