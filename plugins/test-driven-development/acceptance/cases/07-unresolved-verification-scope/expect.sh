#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
if [ "${ACCEPT_HOST:-}" = "claude" ]; then
  require_guard_hook_signal 'TDD Guard.*test scope failed.*same runner.*broader'
else
  require_guard_hook_signal '^hook: Stop Blocked$'
fi

(
  cd "${ACCEPT_WORKSPACE}"
  node --test
)

node --input-type=module - "${ACCEPT_WORKSPACE}/src/rate.mjs" <<'NODE'
import assert from "node:assert/strict";

const { rate } = await import(`file://${process.argv[2]}`);
assert.equal(rate(-2), 0);
assert.equal(rate(3), 3);
NODE

test "$(tr -d '\r\n' < "${ACCEPT_WORKSPACE}/QUALITY.txt")" = "verified"

echo "OK Stop retained the failed full-suite scope until an equivalent broad command passed"
