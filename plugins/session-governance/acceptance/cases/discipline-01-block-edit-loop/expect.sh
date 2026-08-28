#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal "Edit loop blocked"

state_dir="${ACCEPT_WORKSPACE}/.execution-discipline/state"
local_gitignore="${ACCEPT_WORKSPACE}/.execution-discipline/.gitignore"
if [ ! -d "${state_dir}" ]; then
  echo "expect fail: missing .execution-discipline/state" >&2
  exit 1
fi
if [ -d "${ACCEPT_WORKSPACE}/.execution-discipline/.state" ]; then
  echo "expect fail: legacy .execution-discipline/.state was created" >&2
  exit 1
fi
if [ ! -f "${local_gitignore}" ] || [ "$(cat "${local_gitignore}")" != "*" ]; then
  echo "expect fail: .execution-discipline/.gitignore must contain *" >&2
  exit 1
fi
if [ "$(cat "${ACCEPT_WORKSPACE}/.gitignore")" != "vendor/" ]; then
  echo "expect fail: project .gitignore was modified" >&2
  exit 1
fi

echo "OK Execution Loop Guard signal present"
