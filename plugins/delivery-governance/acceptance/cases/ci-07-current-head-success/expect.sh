#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
answer="$(tr -d '\140' <"${ACCEPT_LOG}" | grep -E '^(STATE|EVIDENCE_PIPELINE|HEAD_SHA)=' | tail -3)"
printf '%s\n' "${answer}" | sed -n '1p' | grep -Eiq '^STATE=(delivered|complete|completed)$'
printf '%s\n' "${answer}" | sed -n '2p' | grep -Eq '^EVIDENCE_PIPELINE=406$'
printf '%s\n' "${answer}" | sed -n '3p' | grep -Eq '^HEAD_SHA=ffffffffffffffffffffffffffffffffffffffff$'
echo "OK only the current-head successful pipeline closed delivery"
