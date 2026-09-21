#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal '\[TDD Method\]'
grep -Fq 'export function createOrder' "${ACCEPT_WORKSPACE}/src/billing/order-service.mjs"
grep -Fq 'export function createOrder' "${ACCEPT_WORKSPACE}/src/shipping/order-service.mjs"
if grep -Fq '[TDD Guard] Blocked' "${ACCEPT_LOG}"; then
  echo "same-named modules triggered an unexpected TDD denial" >&2
  exit 1
fi
echo "OK same-named modules require no Hook-level test identity inference"
