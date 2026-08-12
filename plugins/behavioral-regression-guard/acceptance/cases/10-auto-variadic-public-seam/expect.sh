#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'Reproducible-fix evidence'
require_guard_hook_signal '\[Behavioral Regression Guard\] (Bound BR-|Receipt BR-R)'
node - "${ACCEPT_WORKSPACE}" <<'NODE'
const assert = require("node:assert/strict");
const root = process.argv[2];
const { combineContributors } = require(`${root}/src/combine-contributors.cjs`);
assert.deepEqual(combineContributors(), []);
assert.deepEqual(combineContributors(["a"]), ["a"]);
assert.deepEqual(combineContributors(["a"], ["b"]), ["a", "b"]);
assert.deepEqual(combineContributors(["a"], ["b"], ["c"], ["d"]), ["a", "b", "c", "d"]);
NODE
contract="$(find "${ACCEPT_WORKSPACE}/.behavioral-regression" -maxdepth 1 -name 'BR-*.json' -type f | head -1)"
[ -n "${contract}" ] || { echo "expect fail: auto-route did not create a regression contract" >&2; exit 1; }
jq -e '.status == "closed" and all(.cases[]; .receipts.before != null and .receipts.after != null)' "${contract}" >/dev/null
jq -e '.schema == "behavioral-regression/v10" and .surface.inputShape == "variadic" and (.surface.callForms | all(.variadic and (.sourcePath | length > 0) and (.signatureLocator | length > 0))) and (.surface.publicSeam | test("combineContributors")) and (.surface.constraintSeam | test("combineContributors")) and (.scope.regressionPaths | length > 0)' "${contract}" >/dev/null
jq -e '([.cases[].coverage[]] | unique) as $coverage | all(["primary", "public-seam", "constraint-seam", "compatibility", "arity-zero", "arity-one", "arity-two", "arity-many"][]; . as $token | $coverage | index($token))' "${contract}" >/dev/null
echo "OK auto-routed public variadic seam closed with full arity coverage"
