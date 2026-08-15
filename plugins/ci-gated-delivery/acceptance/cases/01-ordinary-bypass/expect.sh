#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_file_exists "${ACCEPT_WORKSPACE}/result.txt"
test "$(cat "${ACCEPT_WORKSPACE}/result.txt")" = "ordinary change"
require_file_absent "${ACCEPT_WORKSPACE}/.delivery"
require_file_absent "${ACCEPT_WORKSPACE}/.ci-gated-delivery"
echo "OK ordinary local work bypassed delivery workflow"
