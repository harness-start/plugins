#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal '\[Verification Provenance Guard\]|hook: Stop'
if grep -Eq 'Completion evidence is incomplete|Completion remains blocked' "${ACCEPT_LOG}"; then
  echo "expect fail: ordinary answer was blocked" >&2
  exit 1
fi

echo "OK ordinary answer bypassed completion evidence gate"
