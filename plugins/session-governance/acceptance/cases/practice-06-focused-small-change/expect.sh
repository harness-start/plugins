#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'narrow.*low-risk.*focused verification.*do not infer a full repository suite'

require_file_absent "${ACCEPT_WORKSPACE}/.full-suite-ran"
node --test "${ACCEPT_WORKSPACE}/test/normalize-label.test.mjs"

node --input-type=module -e \
  'import(process.argv[1]).then(({ normalizeLabel }) => { if (normalizeLabel("   ") !== "" || normalizeLabel(" ready ") !== "ready") process.exit(1); })' \
  "file://${ACCEPT_WORKSPACE}/src/normalize-label.mjs"

changed="$(git -C "${ACCEPT_WORKSPACE}" diff --name-only HEAD -- | sort)"
expected="$(printf '%s\n' src/normalize-label.mjs test/normalize-label.test.mjs | sort)"
if [ "${changed}" != "${expected}" ]; then
  printf 'expect fail: focused change touched unexpected tracked files:\n%s\n' "${changed:-<none>}" >&2
  exit 1
fi

echo "OK focused change used target-level evidence without running the repository suite"
