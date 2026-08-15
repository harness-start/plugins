#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal 'Registered 5 hooks from 1 plugins|hook: SessionStart|Hook.*SessionStart'
if [ -e "${ACCEPT_WORKSPACE}/.debug-workflow" ]; then
  echo "expect fail: an ordinary explanation activated the workflow" >&2
  exit 1
fi
if grep -Eq 'Bound DWO-|Evidence and mutations are now attributed' "${ACCEPT_LOG}"; then
  echo "expect fail: activation signal present without a work order" >&2
  exit 1
fi
echo "OK skill loading and SessionStart did not activate a workflow"
