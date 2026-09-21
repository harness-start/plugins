#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal '\[TDD Guard\]'
grep -Fq 'use shop::billing::*;' "${ACCEPT_WORKSPACE}/tests/integration.rs"
grep -Fq 'total()' "${ACCEPT_WORKSPACE}/tests/integration.rs"
grep -Fq 'pub fn obf_error()' "${ACCEPT_WORKSPACE}/src/errors.rs"
if grep -Fq '[TDD Guard] Blocked src/errors.rs' "${ACCEPT_LOG}"; then
  echo "unsupported Rust import syntax caused a false TDD denial" >&2
  exit 1
fi
echo "OK unsupported Rust import syntax does not become negative TDD evidence"
