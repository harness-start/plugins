#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started

(
  cd "${ACCEPT_WORKSPACE}"
  node --test
)

node --input-type=module - "${ACCEPT_WORKSPACE}/src/cap.mjs" <<'NODE'
import assert from "node:assert/strict";

const { cap } = await import(`file://${process.argv[2]}`);
assert.equal(cap(-3), 0);
assert.equal(cap(4), 4);
NODE

grep -Eq 'cap\(-3\).*0' "${ACCEPT_WORKSPACE}/test/cap.test.mjs"

echo "OK one changed test permitted repeated implementation corrections"
