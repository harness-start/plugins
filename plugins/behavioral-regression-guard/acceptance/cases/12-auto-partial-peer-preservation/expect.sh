#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'Reproducible-fix evidence'
require_guard_hook_signal '\[Behavioral Regression Guard\] (Bound BR-|Receipt BR-R)'
node - "${ACCEPT_WORKSPACE}" <<'NODE'
const assert = require("node:assert/strict");
const root = process.argv[2];
const { mapChannels } = require(`${root}/src/channel-map.cjs`);
assert.deepEqual(mapChannels([], [2]), [[], [6]]);
assert.deepEqual(mapChannels([2], []), [[4], []]);
assert.deepEqual(mapChannels([], []), [[], []]);
assert.deepEqual(mapChannels([2], [3]), [[4], [9]]);
NODE
contract="$(find "${ACCEPT_WORKSPACE}/.behavioral-regression" -maxdepth 1 -name 'BR-*.json' -type f | head -1)"
[ -n "${contract}" ] || { echo "expect fail: auto-route did not create a regression contract" >&2; exit 1; }
jq -e '.status == "closed" and .schema == "behavioral-regression/v10" and .surface.inputShape == "multi-component" and (.surface.components | length) == 2 and .surface.constraintSourcePath == "src/channel-map.cjs" and (.scope.regressionPaths | length > 0) and all(.cases[]; .receipts.before != null and .receipts.after != null)' "${contract}" >/dev/null
jq -e '.surface.components as $components | [ .cases[] | select((.coverage | index("each-one-degenerate")) != null and .oracle.kind == "relational") ] as $partial | all($components[]; . as $name | any($partial[]; . as $case | .degenerateComponents == [$name] and ((.preservedComponents | length) == 1) and (.oracle.relations | length) == 1 and all(.oracle.relations[]; . as $relation | $relation.marker as $marker | $relation.kind == "value-and-representation" and ($relation.sourceSample.value | length) > 0 and ($relation.targetSample.value | length) > 0 and ($relation.witnessLocator | contains($relation.sourceComponent)) and (($case.after.includes | index($marker)) != null))))' "${contract}" >/dev/null
echo "OK partial degeneracy preserves every populated peer"
