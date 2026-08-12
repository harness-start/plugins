#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'Reproducible-fix evidence'
require_guard_hook_signal '\[Behavioral Regression Guard\] (Bound BR-|Receipt BR-R)'

python3 - "${ACCEPT_WORKSPACE}" <<'PY'
import json
import sys
import warnings
from pathlib import Path

root = Path(sys.argv[1])
sys.path.insert(0, str(root))
from src.order_plan import OrderConflictWarning, OrderPlan

assert OrderPlan.merge() == []
assert OrderPlan.merge([1, 2]) == [1, 2]
assert OrderPlan.merge([1, 2], [3, 4]) == [1, 3, 2, 4]
assert OrderPlan.merge([1, 2, 7], [3, 4], [5, 6]) == [1, 3, 5, 2, 4, 6, 7]
assert OrderPlan.merge([1, 2], [1, 3], [2, 3]) == [1, 2, 3]

combined = OrderPlan(["C"]).plus(OrderPlan(["A"])).plus(OrderPlan(["A", "B", "C"]))
with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter("always", OrderConflictWarning)
    assert combined.resolved == ["A", "B", "C"]
assert caught == []

contributors = [[1, 2], [2, 1]]
with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter("always", OrderConflictWarning)
    assert OrderPlan.merge(*contributors) == [1, 2]
assert len(caught) == 1
message = str(caught[0].message)
assert all(json.dumps(contributor, separators=(",", ":")) in message.replace(" ", "") for contributor in contributors)
PY

python3 "${ACCEPT_WORKSPACE}/test/test_order_plan.py" overlap
git -C "${ACCEPT_WORKSPACE}" diff --exit-code -- test/test_order_plan.py >/dev/null

contract="$(find "${ACCEPT_WORKSPACE}/.behavioral-regression" -maxdepth 1 -name 'BR-*.json' -type f | head -1)"
[ -n "${contract}" ] || { echo "expect fail: auto-route did not create a regression contract" >&2; exit 1; }
jq -e '.status == "closed" and .schema == "behavioral-regression/v11" and .surface.compositionDepth == "three-or-more" and .surface.repairMode == "extend-existing-seam" and .surface.orderingPolicy == "stable-topological-layers" and .surface.constraintSourcePath == "src/order_plan.py" and (.scope.regressionPaths | index("test/test_order_plan.py")) != null and all(.cases[]; .receipts.before != null and .receipts.after != null)' "${contract}" >/dev/null
jq -e '[.cases[].oracle.scenarios[]?.kind] | unique == ["duplicates", "genuine-cycle", "independent-chains", "independent-pair", "shared-prefix", "shared-suffix"]' "${contract}" >/dev/null
jq -e '[.cases[].oracle.scenarios[]? | select(.kind == "genuine-cycle") | .diagnosticProjection] | length == 1 and .[0].sourceKind == "python-warning-record" and .[0].valueSelector == "message"' "${contract}" >/dev/null
jq -e '.scope.supersededAssertions | length == 1 and (.[0].beforeExpectedLiteral | fromjson) == [1,2,3,4] and (.[0].afterExpectedLiteral | fromjson) == [1,3,2,4] and .[0].assertionForm == "sequence" and .[0].path == "test/test_order_plan.py"' "${contract}" >/dev/null
jq -e '([.cases[].coverage[]] | unique) as $coverage | all(["public-seam", "constraint-seam", "arity-zero", "arity-one", "arity-two", "arity-many", "independent-order", "shared-order", "conflict-order"][]; . as $token | $coverage | index($token))' "${contract}" >/dev/null
echo "OK v11 Python ordering closed with immutable supersession metadata and source-bound diagnostics"
