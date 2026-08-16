#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal '\[Research Provenance Guard\]|Loading research evidence contract|hook: Stop'
if grep -Eq 'Completion blocked.*research|missing the exact research-evidence' "${ACCEPT_LOG}"; then
  echo "expect fail: ordinary answer entered hard research mode" >&2
  exit 1
fi
echo "OK ordinary answer bypassed research gate"
