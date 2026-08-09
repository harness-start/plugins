#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
if grep -Fq '[Artifact Evidence Guard]' "${ACCEPT_LOG}"; then
  echo "expect fail: ordinary answer was blocked" >&2
  exit 1
fi
grep -Fxq 'ordinary artifact work' "${ACCEPT_WORKSPACE}/ordinary.txt"
grep -Fq 'ordinary artifact answer' "${ACCEPT_LOG}"

echo "OK ordinary answer bypassed artifact evidence guard"
