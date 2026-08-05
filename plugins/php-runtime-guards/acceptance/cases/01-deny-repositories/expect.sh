#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_composer_json_without_repositories "${ACCEPT_WORKSPACE}/composer.json"
require_guard_hook_signal "${MARKERS_PHP_REPOSITORIES}|${MARKERS_HOOK_DENY}"
echo "OK php deny repositories (world state + real guard signal)"
