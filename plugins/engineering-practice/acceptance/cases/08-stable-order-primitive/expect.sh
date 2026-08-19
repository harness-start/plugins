#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_prompt_context_signal 'Engineering Practice: stable-order challenge.*search the repository.*existing stable primitive.*named public seam.*zero, one, two, and many.*two independent chains.*at least two items each.*stable ready-frontier.*duplicates.*cycle fallback.*exact diagnostic'

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
    if (!same(ChainRegistry.combine(["a", "b"], ["c", "d"]), ["a", "c", "b", "d"])) process.exit(1);
    const registry = new ChainRegistry([["ship"], ["build"], ["build", "check", "ship"]]);
    if (!same(registry.stages, ["build", "check", "ship"])) process.exit(1);
    if (ChainRegistry.warnings.length !== 0) process.exit(1);
    ChainRegistry.clearWarnings();
    if (!same(ChainRegistry.combine(["x", "y"], ["y", "x"]), ["x", "y"])) process.exit(1);
    if (!same(ChainRegistry.warnings, ["cycle in chains"])) process.exit(1);
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
