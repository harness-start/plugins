#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_file_absent "${ACCEPT_WORKSPACE}/bootstrap/cache/packages.php"
require_file_absent "${ACCEPT_WORKSPACE}/storage/logs/laravel.log"
# Real markers only — never bootstrap/cache|storage/logs path fragments.
require_guard_hook_signal "${MARKERS_LARAVEL}|${MARKERS_HOOK_DENY}"
echo "OK laravel protected path (file absent + real guard signal)"
