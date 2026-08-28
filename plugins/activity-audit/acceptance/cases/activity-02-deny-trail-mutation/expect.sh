#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal '\[Command Exec Audit\]|Audit trail is protected|'"${MARKERS_HOOK_DENY}"

# Trail directory should still exist (seed succeeded; destroy denied).
if [ ! -d "${ACCEPT_WORKSPACE}/.agent-activity-audit" ]; then
  echo "expect fail: .agent-activity-audit was removed" >&2
  exit 1
fi

echo "OK agent-activity-audit protect denied trail mutation"
