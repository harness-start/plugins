#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started

node --test "${ACCEPT_WORKSPACE}/test/cache-key.test.mjs"
node --input-type=module -e \
  'import(process.argv[1]).then(({ normalizeCacheKey }) => { if (normalizeCacheKey("win32", "Users\\Ada\\Cache") !== "users/ada/cache" || normalizeCacheKey("posix", "Users\\Ada\\Cache") !== "Users/Ada/Cache") process.exit(1); })' \
  "file://${ACCEPT_WORKSPACE}/src/cache-key.mjs"

if ! grep -Fq 'win32' "${ACCEPT_WORKSPACE}/src/cache-key.mjs"; then
  echo "expect fail: platform-specific compatibility behavior was erased" >&2
  exit 1
fi

changed="$(git -C "${ACCEPT_WORKSPACE}" diff --name-only HEAD -- | sort)"
case "${changed}" in
  ""|"src/cache-key.mjs") ;;
  *) printf 'expect fail: contract-preserving refactor touched unexpected tracked files:\n%s\n' "${changed}" >&2; exit 1 ;;
esac

extra="$(find "${ACCEPT_WORKSPACE}" \
  -path "${ACCEPT_WORKSPACE}/.git" -prune -o \
  -path "${ACCEPT_WORKSPACE}/.execution-discipline" -prune -o \
  -path "${ACCEPT_WORKSPACE}/.language-output" -prune -o \
  -type f \
  ! -path "${ACCEPT_WORKSPACE}/package.json" \
  ! -path "${ACCEPT_WORKSPACE}/src/cache-key.mjs" \
  ! -path "${ACCEPT_WORKSPACE}/test/cache-key.test.mjs" -print)"
test -z "${extra}"

echo "OK bounded ablation preserved load-bearing platform compatibility behavior"
