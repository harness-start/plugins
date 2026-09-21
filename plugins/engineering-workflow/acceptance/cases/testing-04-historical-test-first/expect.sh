#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal '\[TDD Method\]'
grep -Eq 'function[[:space:]]+total' "${ACCEPT_WORKSPACE}/src/Service/OrderService.php"
if ! grep -Fq 'test_creates_an_order' "${ACCEPT_WORKSPACE}/tests/Unit/Service/OrderServiceTest.php"; then
  echo "historical test file is missing" >&2
  exit 1
fi
if grep -Eq 'total' "${ACCEPT_WORKSPACE}/tests/Unit/Service/OrderServiceTest.php"; then
  echo "historical test was modified" >&2
  exit 1
fi
if grep -Fq '[TDD Guard] Blocked' "${ACCEPT_LOG}"; then
  echo "advisory TDD unexpectedly treated a historical test as write authorization" >&2
  exit 1
fi
echo "OK historical source edit is allowed without inferred test authorization"
