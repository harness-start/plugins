#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal '\[TDD Guard\] Blocked src/shipping/order-service\.mjs'
test ! -e "${ACCEPT_WORKSPACE}/src/shipping/order-service.mjs"
node --test "${ACCEPT_WORKSPACE}/test/billing/order-service.test.mjs"
grep -Fq '../../src/billing/order-service.mjs' "${ACCEPT_WORKSPACE}/test/billing/order-service.test.mjs"
grep -Fq 'export function createOrder' "${ACCEPT_WORKSPACE}/src/billing/order-service.mjs"
echo "OK wrong same-named module was blocked and the matching implementation passed"
