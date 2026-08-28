#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
answer="$(tr -d '\140' <"${ACCEPT_LOG}" | grep -E '^(STATE|REASON|PIPELINE)=' | tail -3)"
printf '%s\n' "${answer}" | sed -n '1p' | grep -Eiq '^STATE=(externally[ _-]?blocked|blocked|not[ _-]?delivered|failed)$'
printf '%s\n' "${answer}" | sed -n '2p' | grep -Eiq '^REASON=.*(default|master|main).*(pipeline|CI).*(fail|failed)|^REASON=.*(fail|failed).*(default|master|main).*(pipeline|CI)'
printf '%s\n' "${answer}" | sed -n '3p' | grep -Eiq '^PIPELINE=.*404.*fail|^PIPELINE=.*fail.*404'
echo "OK failed default-branch pipeline prevented delivery completion"
