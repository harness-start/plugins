#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal '\[TDD Guard\] Blocked'
test ! -e "${ACCEPT_WORKSPACE}/src/Service/InvoiceService.php"
test ! -e "${ACCEPT_WORKSPACE}/tests/Unit/InvoiceServiceTest.php"
echo "OK source-first implementation was blocked before file creation"
