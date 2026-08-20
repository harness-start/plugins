#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal '\[TDD Guard\] Blocked'
require_guard_hook_signal 'none has changed'
if grep -Eq 'function[[:space:]]+total' "${ACCEPT_WORKSPACE}/src/Service/OrderService.php"; then
  echo "source was mutated despite historical tests" >&2
  exit 1
fi
if ! grep -Fq 'test_creates_an_order' "${ACCEPT_WORKSPACE}/tests/Unit/Service/OrderServiceTest.php"; then
  echo "historical test file is missing" >&2
  exit 1
fi
if grep -Eq 'total' "${ACCEPT_WORKSPACE}/tests/Unit/Service/OrderServiceTest.php"; then
  echo "historical test was modified" >&2
  exit 1
fi
echo "OK historical source edit was blocked until existing tests change"
