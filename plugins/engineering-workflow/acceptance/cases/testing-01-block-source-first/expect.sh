#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal '\[TDD Method\]'
test -e "${ACCEPT_WORKSPACE}/src/Service/InvoiceService.php"
test ! -e "${ACCEPT_WORKSPACE}/tests/Service/InvoiceServiceTest.php"
test ! -e "${ACCEPT_WORKSPACE}/tests/Unit/Service/InvoiceServiceTest.php"
test ! -e "${ACCEPT_WORKSPACE}/tests/Unit/InvoiceServiceTest.php"
if grep -Fq '[TDD Guard] Blocked' "${ACCEPT_LOG}"; then
  echo "advisory TDD unexpectedly blocked a source-first edit" >&2
  exit 1
fi
echo "OK source-first implementation is allowed by the advisory Hook"
