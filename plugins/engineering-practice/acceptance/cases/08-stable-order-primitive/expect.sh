#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_prompt_context_signal 'Engineering Practice: stable-order challenge.*repository-wide search.*stable/topological/dependency.*existing primitive.*named public seam.*zero, one, two, and many.*single-input side branch.*own deduplication.*incidental input container.*audit every aggregate caller.*sibling consumers.*two independent chains.*at least two items each.*Stable ready-frontier.*a1.*b1.*a2.*b2.*not.*a1.*a2.*b1.*b2.*adjacent duplicate.*same chain.*self-dependency.*cycle.*genuine cycle fallback.*every distinct item.*every caller group.*unique.*later groups.*exact diagnostic.*request disputes the diagnostic content.*original caller-supplied constraint groups.*complete original input sequences.*not a pair of elements extracted from them.*arbitrary internal cycle nodes.*Preserve each collection boundary.*do not flatten.*member text.*one grammatical summary.*project-conventional delimiters.*do not retain.*one-item-per-line'

(
  cd "${ACCEPT_WORKSPACE}"
  node --test
)

node --input-type=module -e '
  import(process.argv[1]).then(({ ChainRegistry }) => {
    const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
    ChainRegistry.clearWarnings();
    if (!same(ChainRegistry.combine(), [])) process.exit(1);
    if (!same(ChainRegistry.combine(["one", "one"]), ["one"])) process.exit(1);
    if (!same(new ChainRegistry([["one", "one"]]).stages, ["one"])) process.exit(1);
    if (!same(ChainRegistry.combine(["a", "b"], ["c", "d"]), ["a", "c", "b", "d"])) process.exit(1);
    const registry = new ChainRegistry([["ship"], ["build"], ["build", "check", "ship"]]);
    if (!same(registry.stages, ["build", "check", "ship"])) process.exit(1);
    if (ChainRegistry.warnings.length !== 0) process.exit(1);
    ChainRegistry.clearWarnings();
    if (!same(ChainRegistry.combine(["x", "y"], ["y", "x"]), ["x", "y"])) process.exit(1);
    if (!same(ChainRegistry.warnings, ["cycle in chains: [\"x\",\"y\"] <> [\"y\",\"x\"]"])) process.exit(1);
    ChainRegistry.clearWarnings();
    if (!same(ChainRegistry.combine(["left", "x", "y"], ["y", "x", "right"]), ["left", "x", "y", "right"])) process.exit(1);
    if (!same(ChainRegistry.warnings, ["cycle in chains: [\"left\",\"x\",\"y\"] <> [\"y\",\"x\",\"right\"]"])) process.exit(1);
  });
' "file://${ACCEPT_WORKSPACE}/src/chain-registry.mjs"

grep -Eq 'stable-order\.mjs' "${ACCEPT_WORKSPACE}/src/chain-registry.mjs"
grep -Eiq 'test\("[^"]*(independent[^"]*(ready|stage)|(ready|stage)[^"]*independent)' \
  "${ACCEPT_WORKSPACE}/test/chain-registry.test.mjs"
extra="$(find "${ACCEPT_WORKSPACE}" \
  -path "${ACCEPT_WORKSPACE}/.git" -prune -o \
  -type f \
  ! -path "${ACCEPT_WORKSPACE}/README.md" \
  ! -path "${ACCEPT_WORKSPACE}/src/stable-order.mjs" \
  ! -path "${ACCEPT_WORKSPACE}/src/chain-registry.mjs" \
  ! -path "${ACCEPT_WORKSPACE}/test/chain-registry.test.mjs" -print)"
if [ -n "${extra}" ]; then
  echo "expect fail: stable-order scenario created unrelated files: ${extra}" >&2
  exit 1
fi

echo "OK existing stable primitive defines complete ordering contract"
