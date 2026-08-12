#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'Reproducible-fix evidence'
require_guard_hook_signal '\[Behavioral Regression Guard\] (Bound BR-|Receipt BR-R)'
node - "${ACCEPT_WORKSPACE}" <<'NODE'
const assert = require("node:assert/strict");
const root = process.argv[2];
const { transform } = require(`${root}/src/transform.cjs`);
assert.deepEqual(transform([], [], 2), [[], []]);
assert.deepEqual(transform([], [3], 2), [[], [6]]);
assert.deepEqual(transform([3], [], 2), [[6], []]);
assert.deepEqual(transform([[1, 2]], 2), [[2, 4]]);
assert.deepEqual(transform([1], [2], 2), [[2], [4]]);
NODE
contract="$(find "${ACCEPT_WORKSPACE}/.behavioral-regression" -maxdepth 1 -name 'BR-*.json' -type f | head -1)"
[ -n "${contract}" ] || { echo "expect fail: auto-route did not create a regression contract" >&2; exit 1; }
jq -e '.status == "closed" and .schema == "behavioral-regression/v10" and .surface.inputShape == "variadic" and (.surface.semantics | index("representation")) != null and (.surface.components | length) == 2 and (.surface.callForms | any(.variadic and (.signatureLocator | contains("...args")) and .sourcePath == "src/transform.cjs")) and (.scope.regressionPaths | index("test/compat.cjs")) != null and all(.cases[]; .receipts.before != null and .receipts.after != null)' "${contract}" >/dev/null
jq -e '.surface.components as $components | [ .cases[] | select((.coverage | index("each-one-degenerate")) != null and .oracle.kind == "relational") ] as $partial | all($components[]; . as $name | any($partial[]; .degenerateComponents == [$name] and ((.preservedComponents | length) == 1) and (.oracle.relations | length) == 1))' "${contract}" >/dev/null
echo "OK source-bound variadic interaction preserves asymmetric peers"
