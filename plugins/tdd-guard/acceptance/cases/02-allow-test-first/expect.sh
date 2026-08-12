#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
if [ "${ACCEPT_HOST}" = "codex" ]; then
  test_path="tests/Unit/PriceCalculatorTest.php"
  test_hash="$(sha256sum "${ACCEPT_WORKSPACE}/${test_path}" | awk '{print $1}')"
  state_file="$(find "${ACCEPT_OUT}/codex-home/plugins/data" -path '*/tdd-guard/sessions/*.json' -type f -print -quit)"
  test -n "${state_file}"
  jq -e --arg path "${test_path}" --arg hash "${test_hash}" \
    '.tests[] | select(.path == $path and .hash == $hash and .evidence.valid == true and (.evidence.testNames | index("test_calculates_total")) and (.evidence.references | index("PriceCalculator")))' \
    "${state_file}" >/dev/null
else
  require_guard_hook_signal '\[TDD Guard\] Recorded test-first evidence'
fi
grep -Fq 'test_calculates_total' "${ACCEPT_WORKSPACE}/tests/Unit/PriceCalculatorTest.php"
grep -Fq 'class PriceCalculator' "${ACCEPT_WORKSPACE}/src/PriceCalculator.php"
echo "OK related implementation was created after test-first evidence"
