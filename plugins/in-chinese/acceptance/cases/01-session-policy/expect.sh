#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal "${MARKERS_IN_CHINESE}"
if [ "${ACCEPT_HOST:-}" = "codex" ]; then
  require_guard_hook_signal 'hook: SessionStart Completed'
fi
if ! grep -Eq '[一-龥]' "${ACCEPT_LOG}"; then
  echo "expect fail: response did not identify Chinese as the required prose language" >&2
  exit 1
fi
echo "OK in-chinese SessionStart policy injected"
