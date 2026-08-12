#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'Reproducible-fix evidence'
require_guard_hook_signal '\[Behavioral Regression Guard\] (Bound BR-|Receipt BR-R)'
node - "${ACCEPT_WORKSPACE}" <<'NODE'
const assert = require("node:assert/strict");
const root = process.argv[2];
const { OrderPlan } = require(`${root}/src/order-plan.cjs`);
assert.deepEqual(OrderPlan.merge(), []);
assert.deepEqual(OrderPlan.merge([1, 2]), [1, 2]);
assert.deepEqual(OrderPlan.merge([1, 2], [3, 4]), [1, 3, 2, 4]);
assert.deepEqual(OrderPlan.merge([1, 2], [1, 3], [2, 3]), [1, 2, 3]);
assert.deepEqual(
  OrderPlan.merge([1, 2], [1, 3], [2, 3], [5, 7], [5, 6], [6, 7, 9], [8, 9]),
  [1, 5, 8, 2, 6, 3, 7, 9],
);
const combined = new OrderPlan(["C"]).plus(new OrderPlan(["A"])).plus(new OrderPlan(["A", "B", "C"]));
assert.deepEqual(combined.resolved, ["A", "B", "C"]);
NODE
contract="$(find "${ACCEPT_WORKSPACE}/.behavioral-regression" -maxdepth 1 -name 'BR-*.json' -type f | head -1)"
[ -n "${contract}" ] || { echo "expect fail: auto-route did not create a regression contract" >&2; exit 1; }
jq -e '.status == "closed" and .schema == "behavioral-regression/v10" and .surface.compositionDepth == "three-or-more" and .surface.repairMode == "extend-existing-seam" and .surface.orderingPolicy == "stable-topological-layers" and (.surface.constraintSeam | test("merge")) and (.surface.constraintLocator | contains("(")) and .surface.constraintSourcePath == "src/order-plan.cjs" and (.scope.regressionPaths | index("test/compat.cjs")) != null and all(.cases[]; .receipts.before != null and .receipts.after != null)' "${contract}" >/dev/null
jq -e '[.cases[].oracle.scenarios[]?.kind] | unique == ["duplicates", "genuine-cycle", "independent-chains", "independent-pair", "shared-prefix", "shared-suffix"]' "${contract}" >/dev/null
jq -e '([.cases[].coverage[]] | unique) as $coverage | all(["public-seam", "constraint-seam", "arity-zero", "arity-one", "arity-two", "arity-many"][]; . as $token | $coverage | index($token))' "${contract}" >/dev/null
echo "OK three-or-more composition repaired through the existing constraint seam"
