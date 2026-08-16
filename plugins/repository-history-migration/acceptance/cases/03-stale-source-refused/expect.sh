#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_file_exists "${ACCEPT_WORKSPACE}/preflight.json"
test "$(git -C "${ACCEPT_WORKSPACE}/source" rev-list --count HEAD)" = "3"
test -z "$(git -C "${ACCEPT_WORKSPACE}/source" status --porcelain=v1)"
test ! -e "${ACCEPT_WORKSPACE}/target"
grep -Eiq 'source HEAD changed|stale seal|stale source' "${ACCEPT_LOG}"
echo "OK stale source seal was refused before target creation"
