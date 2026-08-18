#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_file_exists "${ACCEPT_WORKSPACE}/src/page.css"
grep -Fq 'box-shadow: 4px 4px 0' "${ACCEPT_WORKSPACE}/src/page.css"
if grep -Eq 'HARD_OFFSET_SHADOW' "${ACCEPT_LOG}"; then
  echo "OK hook named HARD_OFFSET_SHADOW"
else
  echo "FAIL expected HARD_OFFSET_SHADOW in host log" >&2
  exit 1
fi
