#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
grep -Fq "totals the order" "${ACCEPT_WORKSPACE}/test/service/order-service.test.mjs"
grep -Fq "orderTotal" "${ACCEPT_WORKSPACE}/test/service/order-service.test.mjs"
grep -Fq "export function orderTotal" "${ACCEPT_WORKSPACE}/src/service/order-service.mjs"
node --test "${ACCEPT_WORKSPACE}/test/service/order-service.test.mjs"
echo "OK already-failing historical tests authorized the implementation fix"
