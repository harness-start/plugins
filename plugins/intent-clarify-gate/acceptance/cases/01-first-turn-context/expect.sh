#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_intent_first_turn_signal
require_intent_discovery_skill_loaded
require_file_exists "${ACCEPT_WORKSPACE}/src/normalize-text.mjs"
grep -Fq 'export function normalizeText' "${ACCEPT_WORKSPACE}/src/normalize-text.mjs"
node --test "${ACCEPT_WORKSPACE}/test/normalize-text.test.mjs"
echo "OK first-turn discovery preserved the repository contract and fixed the target behavior"
