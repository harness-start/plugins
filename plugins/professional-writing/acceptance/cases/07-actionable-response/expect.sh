#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'actionable-response'

if [ "${ACCEPT_HOST}" = "claude" ]; then
  grep -Eq 'SkillTool returning.*skill (professional-writing:)?actionable-response' "${ACCEPT_LOG}"
  reply="$(sed -n '1,80p' "${ACCEPT_LOG}")"
else
  grep -Eq '/skills/actionable-response/SKILL\.md|===== actionable-response =====' "${ACCEPT_LOG}"
  reply="$(awk '$0 == "codex" { in_reply = 1; next } in_reply { sub(/^> /, ""); print }' "${ACCEPT_LOG}")"
fi

for required in 'config/app.json' 'npm run migrate' 'npm test'; do
  if [[ "${reply}" != *"${required}"* ]]; then
    echo "Acceptance failed: the actionable response omitted a required item: ${required}" >&2
    exit 1
  fi
done
printf '%s' "${reply}" | grep -Eq '(^|[[:space:]])1\.'
printf '%s' "${reply}" | grep -Eq '(^|[[:space:]])2\.'
printf '%s' "${reply}" | grep -Eq '(^|[[:space:]])3\.'
if printf '%s' "${reply}" | grep -Eiq 'ADHD|attention disorder|minutes?|hours?|hope this helps|let me know|no other steps|that is all'; then
  echo "Acceptance failed: the actionable response diagnosed the reader, invented a duration, or added a generic closing" >&2
  exit 1
fi

extra="$(find "${ACCEPT_WORKSPACE}" -path "${ACCEPT_WORKSPACE}/.git" -prune -o -type f ! -name .gitkeep -print)"
if [ -n "${extra}" ]; then
  echo "Acceptance failed: the actionable response created a file: ${extra}" >&2
  exit 1
fi

echo "PASS: the actionable response preserved task order without diagnosis, invented time, or filler"
