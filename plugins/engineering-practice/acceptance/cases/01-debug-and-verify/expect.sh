#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'Engineering Mindset.*Selective Skill routing'

if [ "${ACCEPT_HOST}" = "claude" ]; then
  require_session_context_signal 'Claude loading rule.*native Skill tool'
else
  require_session_context_signal 'Codex loading rule.*\.agents/skills/<name>/SKILL\.md'
  require_session_context_signal 'Codex completion gate.*verification-before-completion'
fi

(
  cd "${ACCEPT_WORKSPACE}"
  node --test
)

node --input-type=module -e \
  'import(process.argv[1]).then(({ canAllocate }) => { if (!canAllocate(4, 4) || canAllocate(5, 4)) process.exit(1); })' \
  "file://${ACCEPT_WORKSPACE}/src/capacity.mjs"

grep -Fq 'assert.equal(canAllocate(4, 4), true);' "${ACCEPT_WORKSPACE}/test/capacity.test.mjs"

extra="$(find "${ACCEPT_WORKSPACE}" \
  -path "${ACCEPT_WORKSPACE}/.git" -prune -o \
  -type f \
  ! -path "${ACCEPT_WORKSPACE}/src/capacity.mjs" \
  ! -path "${ACCEPT_WORKSPACE}/test/capacity.test.mjs" -print)"
if [ -n "${extra}" ]; then
  echo "expect fail: debug scenario created unrelated files: ${extra}" >&2
  exit 1
fi

echo "OK debugging route was injected and the observed behavior was fixed and verified without extra files"
