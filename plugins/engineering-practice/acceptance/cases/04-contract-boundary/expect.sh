#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'observable contract.*value.*type.*container.*shape.*cardinality.*order.*stability.*warning.*error.*public API'

(
  cd "${ACCEPT_WORKSPACE}"
  node --test
)

node --input-type=module -e '
  import(process.argv[1]).then(({ summarizeWindow }) => {
    const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
    if (!same(summarizeWindow([], 3), { count: 0, average: null, bins: [0, 0, 0] })) process.exit(1);
    if (!same(summarizeWindow([5], 2), { count: 1, average: 5, bins: [5, 0] })) process.exit(1);
    if (!same(summarizeWindow([2, 4, 6], 2), { count: 3, average: 4, bins: [8, 4] })) process.exit(1);
    assertThrows(() => summarizeWindow("5", 2), TypeError);
    assertThrows(() => summarizeWindow([5], 0), RangeError);
  });
  function assertThrows(fn, Expected) {
    try { fn(); } catch (error) { if (error instanceof Expected) return; }
    process.exit(1);
  }
' "file://${ACCEPT_WORKSPACE}/src/window-summary.mjs"

grep -Eq 'summarizeWindow\(\[\]' "${ACCEPT_WORKSPACE}/test/window-summary.test.mjs"
extra="$(find "${ACCEPT_WORKSPACE}" \
  -path "${ACCEPT_WORKSPACE}/.git" -prune -o \
  -type f \
  ! -path "${ACCEPT_WORKSPACE}/README.md" \
  ! -path "${ACCEPT_WORKSPACE}/src/window-summary.mjs" \
  ! -path "${ACCEPT_WORKSPACE}/test/window-summary.test.mjs" -print)"
if [ -n "${extra}" ]; then
  echo "expect fail: contract scenario created unrelated files: ${extra}" >&2
  exit 1
fi

echo "OK boundary fix preserved value, container shape, cardinalities, errors, and public API"
