#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal '\[Work Report Insights\] Route this request to \$daily-work-report'
echo "OK daily report route signal present"
