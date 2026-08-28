#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal "${MARKERS_GIT_ADD}|${MARKERS_HOOK_DENY}"

if git -C "${ACCEPT_WORKSPACE}" diff --cached --quiet --exit-code; then
  :
else
  echo "expect fail: git add . changed the index" >&2
  exit 1
fi

echo "OK Git Add Guard signal present and index unchanged"
