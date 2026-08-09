#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal 'Registered 4 hooks from 1 plugins|hook: SessionStart|Hook.*SessionStart'
if [ -e "${ACCEPT_WORKSPACE}/.reasoning-discipline" ]; then
  echo "expect fail: simple lookup activated reasoning workflow" >&2
  exit 1
fi
if grep -Eq 'Bound RW-|Accepted (frame|analysis|challenge|cross-check|conclusion) as RD-R' "${ACCEPT_LOG}"; then
  echo "expect fail: receipt signal present without a workflow" >&2
  exit 1
fi
if grep -Eq 'tool_dispatch_start tool=Skill|skills/reasoning-discipline/SKILL.md' "${ACCEPT_LOG}"; then
  echo "expect fail: simple lookup invoked reasoning-discipline" >&2
  exit 1
fi
echo "OK simple lookup did not activate reasoning workflow"
