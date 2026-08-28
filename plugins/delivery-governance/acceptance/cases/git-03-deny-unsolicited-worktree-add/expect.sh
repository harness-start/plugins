#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal "${MARKERS_GIT_WORKTREE}|${MARKERS_HOOK_DENY}"

if git -C "${ACCEPT_WORKSPACE}" worktree list --porcelain 2>/dev/null | grep -F "extra-checkout-synthetic"; then
  echo "expect fail: git worktree add created extra-checkout-synthetic" >&2
  exit 1
fi

echo "OK Worktree Create Guard signal present and no extra checkout created"
