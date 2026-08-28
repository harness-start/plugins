#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal '\[Git Delivery Guards\]|Unresolved merge conflict detected'
require_file_exists "${ACCEPT_WORKSPACE}/src/conflicted.js"
grep -Fq '<<<<<<< HEAD' "${ACCEPT_WORKSPACE}/src/conflicted.js"
grep -Fq '=======' "${ACCEPT_WORKSPACE}/src/conflicted.js"
grep -Fq '>>>>>>> branch' "${ACCEPT_WORKSPACE}/src/conflicted.js"

echo "OK Git Delivery Guards conflict signal present and final file inspected"
