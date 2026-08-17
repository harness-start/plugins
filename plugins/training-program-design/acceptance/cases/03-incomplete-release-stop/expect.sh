#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal 'Training Program Delivery Guard|hook: Stop'
guard_output="$(printf '{\"cwd\":\"%s\"}\n' "${ACCEPT_WORKSPACE}" | AI_EXPERTS_SESSION_ID=accept-check AI_EXPERTS_TRIGGER_FROM=accept-check node "${ACCEPT_REPO}/plugins/training-program-design/dist/hooks/training-program-design.mjs" stop)"
jq -e '.decision == "block"' <<<"${guard_output}" >/dev/null
grep -Eq 'REQUIRED_PATH_MISSING|PLAN_SCHEMA_INVALID|PACKAGE_SCHEMA_INVALID' <<<"${guard_output}"
echo "OK incomplete training release was blocked at Stop"
