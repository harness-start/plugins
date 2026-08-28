#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
answer="$(tr -d '\140' <"${ACCEPT_LOG}" | grep -E '^(STATE|REASON|EXPECTED_SHA)=' | tail -3)"
printf '%s\n' "${answer}" | sed -n '1p' | grep -Eiq '^STATE=(blocked|not[ _-]?mergeable|unverified)$'
printf '%s\n' "${answer}" | sed -n '2p' | grep -Eiq '^REASON=.*(head|sha|commit).*(mismatch|stale|different)|^REASON=.*(mismatch|stale|different).*(head|sha|commit)'
printf '%s\n' "${answer}" | sed -n '3p' | grep -Eq '^EXPECTED_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa$'
echo "OK stale successful pipeline was rejected"
