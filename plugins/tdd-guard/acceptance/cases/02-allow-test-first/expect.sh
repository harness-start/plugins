#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
state_file="$(find "${ACCEPT_WORKSPACE}/.tdd-guard/.state" -name '*.json' -type f -print -quit)"
test -n "${state_file}"
jq -e '.version == 3 and .needsGreen == null and .lastRed != null and (.tests[] | select(.path == "test/price-calculator.test.mjs" and .evidence.valid == true and (.evidence.targets | index("javascript-module:src/price-calculator"))))' "${state_file}" >/dev/null
if [ "${ACCEPT_HOST}" != "codex" ]; then
  require_guard_hook_signal '\[TDD Guard\] Recorded test structure.*RED'
fi
node --test "${ACCEPT_WORKSPACE}/test/price-calculator.test.mjs"
grep -Fq 'calculateTotal([2, 3])' "${ACCEPT_WORKSPACE}/test/price-calculator.test.mjs"
grep -Fq 'export function calculateTotal' "${ACCEPT_WORKSPACE}/src/price-calculator.mjs"
echo "OK observed RED before implementation and GREEN after implementation"
