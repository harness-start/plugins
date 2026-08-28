#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
test ! -e "${ACCEPT_WORKSPACE}/src/service/discount.mjs"
test ! -e "${ACCEPT_WORKSPACE}/test/service/discount.test.mjs"
echo "OK corresponding tests were removed then the implementation was deleted"
