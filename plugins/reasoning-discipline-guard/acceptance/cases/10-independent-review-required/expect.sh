#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal '\[Reasoning Discipline Guard\]'
require_guard_hook_signal 'independent challenge review is missing or stale'
echo "OK reasoning-discipline-guard independent challenge review signal present"
