#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal '\[TDD Method\]'
grep -Fq 'use shop::billing::*;' "${ACCEPT_WORKSPACE}/tests/integration.rs"
grep -Fq 'total()' "${ACCEPT_WORKSPACE}/tests/integration.rs"
grep -Fq 'pub fn obf_error()' "${ACCEPT_WORKSPACE}/src/errors.rs"
if grep -Fq '[TDD Guard] Blocked' "${ACCEPT_LOG}"; then
  echo "Rust import syntax triggered an unexpected TDD denial" >&2
  exit 1
fi
echo "OK Rust import syntax is not interpreted as Hook-level TDD evidence"
