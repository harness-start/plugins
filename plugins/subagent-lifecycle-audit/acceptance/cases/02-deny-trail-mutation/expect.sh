#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal '\[Subagent Lifecycle Audit\]|Audit trail is protected|'"${MARKERS_HOOK_DENY}"
require_file_exists "${ACCEPT_WORKSPACE}/.subagent-lifecycle-audit/sessions/protected.jsonl"

echo "OK lifecycle audit trail mutation denied"
