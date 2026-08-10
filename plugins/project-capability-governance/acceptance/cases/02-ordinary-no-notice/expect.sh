#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
grep -Fxq '# Ordinary capability fixture' "${ACCEPT_WORKSPACE}/ordinary.txt"
if grep -Fq '<project-capability-notice' "${ACCEPT_LOG}"; then
  echo "expect fail: ordinary task emitted a project capability notice without a proposal" >&2
  exit 1
fi
echo "OK ordinary task completed without a capability notice"
