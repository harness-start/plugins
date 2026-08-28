#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal "${MARKERS_FILE_BUDGET}"

target="${ACCEPT_WORKSPACE}/src/HugeClass.php"
if [ -f "${target}" ]; then
  lines=$(wc -l < "${target}" | tr -d ' ')
  echo "OK Engineering Quality file-budget signal present (file lines=${lines})"
else
  echo "OK Engineering Quality file-budget signal present (no oversized file left)"
fi
