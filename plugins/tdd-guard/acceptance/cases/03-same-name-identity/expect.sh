#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal '\[TDD Guard\] Blocked src/Shipping/OrderService\.php'
test ! -e "${ACCEPT_WORKSPACE}/src/Shipping/OrderService.php"
grep -Fq 'CoversClass(OrderService::class)' "${ACCEPT_WORKSPACE}/tests/Unit/Billing/OrderServiceTest.php"
grep -Fq 'namespace App\Billing;' "${ACCEPT_WORKSPACE}/src/Billing/OrderService.php"
grep -Fq 'class OrderService' "${ACCEPT_WORKSPACE}/src/Billing/OrderService.php"
echo "OK exact PHP FQCN allowed while a same-named class was blocked"
