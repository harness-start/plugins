#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'Engineering Practice.*Optional engineering method guidance'
require_exact_model_reply 'MINDSET-DIRECT-OK'

if [ "${ACCEPT_HOST}" = "claude" ]; then
  if grep -Eq 'tool_dispatch_start tool=Skill' "${ACCEPT_LOG}"; then
    echo "expect fail: simple control loaded a Skill" >&2
    exit 1
  fi
else
  if grep -Eq '/skills/(engineering-judgment|engineering-review|engineering-verification)/SKILL\.md' "${ACCEPT_LOG}"; then
    echo "expect fail: simple control loaded an engineering or writing Skill" >&2
    exit 1
  fi
fi

echo "OK simple control received session context without unnecessary Skill loading"
