#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal 'hook: Stop|Video Project Delivery Guard'
if grep -Eq 'Video Project Delivery Guard.*Project contract violations' "${ACCEPT_LOG}"; then
  echo "expect fail: ordinary answer entered video hard scope" >&2
  exit 1
fi
grep -Fq 'ordinary answer' "${ACCEPT_LOG}"
echo "OK ordinary answer bypassed video gate"
