#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'Engineering Mindset.*Selective Skill routing'
require_session_context_signal 'explicitly asks.*caveman'

if [ "${ACCEPT_HOST}" = "claude" ]; then
  reply="$(sed -n '1p' "${ACCEPT_LOG}")"
else
  reply="$(awk 'previous == "codex" { reply = $0 } { previous = $0 } END { print reply }' "${ACCEPT_LOG}")"
fi

if [[ "${reply}" != *"浅比较"* ]] || [[ "${reply}" != *'`useMemo`'* ]]; then
  echo "expect fail: terse reply lost the shallow-comparison or useMemo content: ${reply}" >&2
  exit 1
fi
if [ "$(printf '%s' "${reply}" | wc -c)" -gt 240 ]; then
  echo "expect fail: token-efficiency reply exceeded 240 bytes: ${reply}" >&2
  exit 1
fi
echo "OK explicit token-efficiency request received the caveman route and preserved the required technical content"
