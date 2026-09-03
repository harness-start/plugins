#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started

node --test "${ACCEPT_WORKSPACE}/test/allocation.test.mjs"
node --input-type=module -e \
  'import(process.argv[1]).then(({ canAllocate }) => { if (!canAllocate(4, 4) || canAllocate(5, 4) || !canAllocate(0, 0)) process.exit(1); })' \
  "file://${ACCEPT_WORKSPACE}/src/allocation.mjs"

if grep -Eq '(^|[[:space:]])class[[:space:]]|function[[:space:]]+(create|make|build)|new[[:space:]]' \
  "${ACCEPT_WORKSPACE}/src/allocation.mjs"; then
  echo "expect fail: redundant single-use allocation layers remain" >&2
  exit 1
fi

changed="$(git -C "${ACCEPT_WORKSPACE}" diff --name-only HEAD -- | sort)"
expected="src/allocation.mjs"
if [ "${changed}" != "${expected}" ]; then
  printf 'expect fail: simplification touched unexpected tracked files:\n%s\n' "${changed:-<none>}" >&2
  exit 1
fi

extra="$(find "${ACCEPT_WORKSPACE}" \
  -path "${ACCEPT_WORKSPACE}/.git" -prune -o \
  -path "${ACCEPT_WORKSPACE}/.execution-discipline" -prune -o \
  -path "${ACCEPT_WORKSPACE}/.language-output" -prune -o \
  -type f \
  ! -path "${ACCEPT_WORKSPACE}/package.json" \
  ! -path "${ACCEPT_WORKSPACE}/src/allocation.mjs" \
  ! -path "${ACCEPT_WORKSPACE}/test/allocation.test.mjs" -print)"
test -z "${extra}"

echo "OK bounded ablation removed redundant layers and preserved the public behavior"
