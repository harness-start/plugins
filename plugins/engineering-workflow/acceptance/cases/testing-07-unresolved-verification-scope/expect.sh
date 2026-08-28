#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
if full_output="$(cd "${ACCEPT_WORKSPACE}" && node --test 2>&1)"; then
  echo "full suite unexpectedly passed" >&2
  exit 1
fi
printf '%s\n' "${full_output}" | grep -Fq 'records completed project verification'

node --input-type=module - "${ACCEPT_WORKSPACE}/src/rate.mjs" <<'NODE'
import assert from "node:assert/strict";

const { rate } = await import(`file://${process.argv[2]}`);
assert.equal(rate(-2), 0);
assert.equal(rate(3), 3);
NODE

node --test "${ACCEPT_WORKSPACE}/test/rate.test.mjs"
test ! -e "${ACCEPT_WORKSPACE}/QUALITY.txt"

echo "OK the related change completed while the unrelated suite failure remained untouched"
