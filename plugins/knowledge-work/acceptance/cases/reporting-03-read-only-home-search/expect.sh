#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
grep -Fxq 'READ_ONLY_OK' "${ACCEPT_WORKSPACE}/read-only-ok.txt"
if grep -Eq '\[Work Report Insights\] Protected report' "${ACCEPT_LOG}"; then
  echo "expect fail: read-only home search was blocked as a report mutation" >&2
  exit 1
fi
echo "OK read-only home search completed without report protection denial"
