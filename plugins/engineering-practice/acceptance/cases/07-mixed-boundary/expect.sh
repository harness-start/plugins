#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_prompt_context_signal 'Engineering Practice: boundary challenge.*current exception or rejection.*not compatibility proof.*all-empty.*mixed empty/populated.*ordinary populated.*unequal cardinality.*zero items.*singleton.*do not synthesize.*shared empty aggregate or matrix.*split it back.*preserve each original caller component.*each output component.*corresponding input.*value and shape'

(
  cd "${ACCEPT_WORKSPACE}"
  node --test
)

node --input-type=module -e '
  import(process.argv[1]).then(({ mapChannels }) => {
    const check = (actual, expected) => {
      if (!Array.isArray(actual) || actual.length !== 2) process.exit(1);
      if (!(actual[0] instanceof Float64Array) || !(actual[1] instanceof Float64Array)) process.exit(1);
      if (JSON.stringify([...actual[0]]) !== JSON.stringify(expected[0])) process.exit(1);
      if (JSON.stringify([...actual[1]]) !== JSON.stringify(expected[1])) process.exit(1);
    };
    check(mapChannels([], [7], 3), [[], [7]]);
    check(mapChannels([4, 5], [], 3), [[4, 5], []]);
    check(mapChannels([], [], 3), [[], []]);
    check(mapChannels([2], [8, 9], 2), [[4, 4], [6, 7]]);
  });
' "file://${ACCEPT_WORKSPACE}/src/channel-mapper.mjs"

grep -Eq 'mapChannels\(\[\], *\[[^]]+\]' "${ACCEPT_WORKSPACE}/test/channel-mapper.test.mjs"
extra="$(find "${ACCEPT_WORKSPACE}" \
  -path "${ACCEPT_WORKSPACE}/.git" -prune -o \
  -type f \
  ! -path "${ACCEPT_WORKSPACE}/README.md" \
  ! -path "${ACCEPT_WORKSPACE}/src/channel-mapper.mjs" \
  ! -path "${ACCEPT_WORKSPACE}/test/channel-mapper.test.mjs" -print)"
if [ -n "${extra}" ]; then
  echo "expect fail: mixed-boundary scenario created unrelated files: ${extra}" >&2
  exit 1
fi

echo "OK mixed boundary components survive lossy alignment"
