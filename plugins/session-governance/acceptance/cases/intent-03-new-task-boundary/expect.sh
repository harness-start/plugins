#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_intent_first_turn_signal
require_file_exists "${ACCEPT_WORKSPACE}/DELIVERY.md"
grep -Fq 'unit tests' "${ACCEPT_WORKSPACE}/DELIVERY.md"
grep -Fq 'distribution bundle' "${ACCEPT_WORKSPACE}/DELIVERY.md"
grep -Fq 'rollback command' "${ACCEPT_WORKSPACE}/DELIVERY.md"

if [ ! -s "${ACCEPT_LOG_SECOND}" ] || ! grep -Fq 'DELIVERY.md' "${ACCEPT_LOG_SECOND}"; then
  echo "expect fail: second turn did not produce the new-task deliverable" >&2
  exit 1
fi

echo "OK materially new task completed without Hook reinjection"
