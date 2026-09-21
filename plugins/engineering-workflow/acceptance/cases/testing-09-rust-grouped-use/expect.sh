#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal '\[TDD Method\]'
grep -Fq 'formatting::{' "${ACCEPT_WORKSPACE}/tests/formatting.rs"
grep -Fq 'obf_error' "${ACCEPT_WORKSPACE}/tests/formatting.rs"
grep -Fq 'obf_fmt' "${ACCEPT_WORKSPACE}/tests/formatting.rs"
grep -Fq 'assert_eq!(obf_error(), "error")' "${ACCEPT_WORKSPACE}/tests/formatting.rs"
grep -Fq 'pub fn obf_error()' "${ACCEPT_WORKSPACE}/src/formatting.rs"
if grep -Fq '[TDD Guard] Blocked' "${ACCEPT_LOG}"; then
  echo "grouped Rust import triggered an unexpected TDD denial" >&2
  exit 1
fi
echo "OK multiline nested Rust imports require no Hook-level semantic inference"
