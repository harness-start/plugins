#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
test ! -e "${ACCEPT_WORKSPACE}/.test-driven-development"
test "$(cat "${ACCEPT_WORKSPACE}/.gitignore")" = "vendor/"
node --test "${ACCEPT_WORKSPACE}/test/price-calculator.test.mjs"
grep -Fq 'calculateTotal([2, 3])' "${ACCEPT_WORKSPACE}/test/price-calculator.test.mjs"
grep -Fq 'export function calculateTotal' "${ACCEPT_WORKSPACE}/src/price-calculator.mjs"
echo "OK the changed test authorized its matching implementation"
