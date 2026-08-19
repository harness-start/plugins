#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'boundary fix.*reuse.*normalization.*shared return path.*synthesized'

(
  cd "${ACCEPT_WORKSPACE}"
  node --test
)

node --input-type=module -e '
  import(process.argv[1]).then(({ convertSamples }) => {
    const axes = convertSamples([], [], 4);
    if (!Array.isArray(axes) || axes.length !== 2) process.exit(1);
    if (!(axes[0] instanceof Float64Array) || !(axes[1] instanceof Float64Array)) process.exit(1);
    if (axes[0].length !== 0 || axes[1].length !== 0) process.exit(1);
    const rows = convertSamples([], 4);
    if (!Array.isArray(rows) || rows.length !== 0) process.exit(1);
    const nonempty = convertSamples([1], [3], 2);
    if (nonempty[0][0] !== 3 || nonempty[1][0] !== 1) process.exit(1);
  });
' "file://${ACCEPT_WORKSPACE}/src/sample-converter.mjs"

grep -Eq 'convertSamples\(\[\], *\[\]' "${ACCEPT_WORKSPACE}/test/sample-converter.test.mjs"
extra="$(find "${ACCEPT_WORKSPACE}" \
  -path "${ACCEPT_WORKSPACE}/.git" -prune -o \
  -type f \
  ! -path "${ACCEPT_WORKSPACE}/README.md" \
  ! -path "${ACCEPT_WORKSPACE}/src/sample-converter.mjs" \
  ! -path "${ACCEPT_WORKSPACE}/test/sample-converter.test.mjs" -print)"
if [ -n "${extra}" ]; then
  echo "expect fail: shared-return scenario created unrelated files: ${extra}" >&2
  exit 1
fi

echo "OK empty inputs preserve both public return paths"
