#!/usr/bin/env bash
set -euo pipefail

REPO="${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}"
. "${REPO}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started

npm --prefix "${ACCEPT_WORKSPACE}" test >/dev/null

node --input-type=module -e '
  import assert from "node:assert/strict";
  import { pathToFileURL } from "node:url";
  const modulePath = pathToFileURL(process.argv[1]).href;
  const { retryDelay } = await import(modulePath);
  assert.equal(retryDelay(1, { baseDelayMs: 75, maxDelayMs: 900 }), 75);
  assert.equal(retryDelay(4, { baseDelayMs: 75, maxDelayMs: 900 }), 600);
  assert.equal(retryDelay(8, { baseDelayMs: 75, maxDelayMs: 900 }), 900);
  assert.throws(() => retryDelay(0), RangeError);
' "${ACCEPT_WORKSPACE}/src/retry-delay.mjs"

changed="$(git -C "${ACCEPT_WORKSPACE}" diff --name-only HEAD --)"
if [ "${changed}" != "src/retry-delay.mjs" ]; then
  printf 'expect fail: tracked change must be exactly src/retry-delay.mjs, got: %s\n' \
    "${changed:-<none>}" >&2
  exit 1
fi

unexpected="$({
  git -C "${ACCEPT_WORKSPACE}" ls-files --others --exclude-standard \
    | grep -Ev '^\.' \
    || true
})"
if [ -n "${unexpected}" ]; then
  printf 'expect fail: unexpected product files created:\n%s\n' "${unexpected}" >&2
  exit 1
fi

printf 'OK software outcome: retry behavior repaired without widening scope\n'
