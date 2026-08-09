#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal '\[Git State Evidence Guard\]|hook: Stop'
git -C "${ACCEPT_WORKSPACE}" rev-parse --verify HEAD >/dev/null
grep -Fq 'HEAD does not match' "${ACCEPT_LOG}"

echo "OK contradictory Git HEAD was blocked at Stop"
