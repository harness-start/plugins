#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
grep -Fxq 'ordinary behavioral work' "${ACCEPT_WORKSPACE}/ordinary.txt"
grep -Fq 'ordinary behavioral answer' "${ACCEPT_LOG}"
if grep -Fq '[Behavioral Regression Guard]' "${ACCEPT_LOG}"; then
  echo "expect fail: no-contract task unexpectedly activated behavioral guard" >&2
  exit 1
fi
echo "OK ordinary task bypassed behavioral regression guard"
