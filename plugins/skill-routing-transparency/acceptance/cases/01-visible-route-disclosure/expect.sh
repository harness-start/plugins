#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal "${MARKERS_SKILL_ROUTING_TRANSPARENCY}"

if [ -n "$(git -C "${ACCEPT_WORKSPACE}" status --porcelain)" ]; then
  echo "expect fail: transparency case modified the workspace" >&2
  git -C "${ACCEPT_WORKSPACE}" status --porcelain >&2
  exit 1
fi

echo "OK Skill route transparency was visible and workspace stayed unchanged"
