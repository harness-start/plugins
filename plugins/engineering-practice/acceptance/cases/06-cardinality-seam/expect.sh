#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'extends arity or composition.*extend the named seam.*old call forms.*add or extend tests.*zero, one, two, and many'

(
  cd "${ACCEPT_WORKSPACE}"
  node --test
)

node --input-type=module -e '
  import(process.argv[1]).then(({ Pipeline }) => {
    const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
    Pipeline.clearWarnings();
    const pipeline = new Pipeline([["deploy"], ["compile"], ["compile", "verify", "deploy"]]);
    if (!same(pipeline.stages, ["compile", "verify", "deploy"])) process.exit(1);
    if (Pipeline.warnings.length !== 0) process.exit(1);
    if (!same(Pipeline.combine(), [])) process.exit(1);
    if (!same(Pipeline.combine(["one", "one"]), ["one"])) process.exit(1);
    const pair = Pipeline.combine(["a", "b"], ["c", "d"]);
    if (new Set(pair).size !== 4 || pair.indexOf("a") > pair.indexOf("b") || pair.indexOf("c") > pair.indexOf("d")) process.exit(1);
    const many = Pipeline.combine(["prepare"], ["prepare", "verify"], ["publish"]);
    if (new Set(many).size !== 3 || many.indexOf("prepare") > many.indexOf("verify")) process.exit(1);
    Pipeline.clearWarnings();
    const conflict = Pipeline.combine(["x", "y"], ["y", "x"]);
    if (new Set(conflict).size !== 2 || Pipeline.warnings.length === 0) process.exit(1);
  });
' "file://${ACCEPT_WORKSPACE}/src/pipeline.mjs"

grep -Eq 'Pipeline\.combine\(\)' "${ACCEPT_WORKSPACE}/test/pipeline.test.mjs"
extra="$(find "${ACCEPT_WORKSPACE}" \
  -path "${ACCEPT_WORKSPACE}/.git" -prune -o \
  -type f \
  ! -path "${ACCEPT_WORKSPACE}/README.md" \
  ! -path "${ACCEPT_WORKSPACE}/src/pipeline.mjs" \
  ! -path "${ACCEPT_WORKSPACE}/test/pipeline.test.mjs" -print)"
if [ -n "${extra}" ]; then
  echo "expect fail: cardinality scenario created unrelated files: ${extra}" >&2
  exit 1
fi

echo "OK named combination seam preserves old calls and zero/one/two/many inputs"
