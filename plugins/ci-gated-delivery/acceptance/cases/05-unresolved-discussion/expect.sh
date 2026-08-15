#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
answer="$(tr -d '\140' <"${ACCEPT_LOG}" | grep -E '^(STATE|REASON|DISCUSSION)=' | tail -3)"
printf '%s\n' "${answer}" | sed -n '1p' | grep -Eiq '^STATE=(blocked|not[ _-]?mergeable|unverified)$'
printf '%s\n' "${answer}" | sed -n '2p' | grep -Eiq '^REASON=.*(discussion|review).*(unresolved|blocking)|^REASON=.*(unresolved|blocking).*(discussion|review)'
printf '%s\n' "${answer}" | sed -n '3p' | grep -Eiq '^DISCUSSION=.*(unresolved|blocking|open)'
echo "OK unresolved blocking discussion prevented merge"
