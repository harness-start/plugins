#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
grep -Fxq '# ordinary acceptance fixture' "${ACCEPT_WORKSPACE}/ordinary.txt"
if grep -Eq '\[Work Report Insights\]' "${ACCEPT_LOG}"; then
  echo "expect fail: ordinary request activated work-report-insights" >&2
  exit 1
fi
echo "OK ordinary request bypassed work-report-insights"
