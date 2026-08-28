#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
if grep -Eq 'Logo Project Delivery Guard.*Project contract violations' "${ACCEPT_LOG}"; then
  echo "expect fail: ordinary answer entered logo hard scope" >&2
  exit 1
fi
grep -Fxq 'ordinary answer' "${ACCEPT_LOG}"
echo "OK ordinary answer bypassed logo gate"
