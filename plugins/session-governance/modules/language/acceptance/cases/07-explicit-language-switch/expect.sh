#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_exact_model_reply 'これはあたらしいげんごでのながいへんとうぶんです。'
if grep -Eq "${MARKERS_LANGUAGE_OUTPUT_GATE}|${MARKERS_STOP_BLOCK}" "${ACCEPT_LOG}"; then
  echo "expect fail: explicit Japanese response request was blocked" >&2
  exit 1
fi
echo "OK explicit Japanese response request updated the session profile"
