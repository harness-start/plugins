#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'Engineering Practice.*Selective engineering Skill orchestration'

(
  cd "${ACCEPT_WORKSPACE}"
  node --test
)

node --input-type=module -e \
  'import(process.argv[1]).then(({ canAllocate, canAllocateBatch }) => { if (!canAllocate(4, 4) || !canAllocateBatch([2, 2], 4) || canAllocateBatch([2, 3], 4)) process.exit(1); })' \
  "file://${ACCEPT_WORKSPACE}/src/capacity.mjs"

grep -Eq 'canAllocateBatch' "${ACCEPT_WORKSPACE}/test/capacity.test.mjs"
extra="$(find "${ACCEPT_WORKSPACE}" \
  -path "${ACCEPT_WORKSPACE}/.git" -prune -o \
  -type f \
  ! -path "${ACCEPT_WORKSPACE}/src/capacity.mjs" \
  ! -path "${ACCEPT_WORKSPACE}/test/capacity.test.mjs" -print)"
if [ -n "${extra}" ]; then
  echo "expect fail: implementation scenario created unrelated files: ${extra}" >&2
  exit 1
fi

echo "OK implementation preserved the public seam, added behavior coverage, and passed the project test"
