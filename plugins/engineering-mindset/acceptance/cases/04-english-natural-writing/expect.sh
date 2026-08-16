#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'English prose.*humanizer.*stop-slop'

if [ "${ACCEPT_HOST}" = "claude" ]; then
  grep -Eq 'SkillTool returning.*skill humanizer' "${ACCEPT_LOG}"
  grep -Eq 'SkillTool returning.*skill stop-slop' "${ACCEPT_LOG}"
  reply="$(sed -n '1p' "${ACCEPT_LOG}")"
else
  grep -Eq '/skills/humanizer/SKILL\.md' "${ACCEPT_LOG}"
  grep -Eq '/skills/stop-slop/SKILL\.md' "${ACCEPT_LOG}"
  reply="$(awk '
    $0 == "codex" { in_reply = 1; next }
    in_reply && index($0, "Orchid API") && index($0, "2026-07-01") &&
      index($0, "p95") && index($0, "420 ms") && index($0, "190 ms") {
        sub(/^> /, ""); print; exit
      }
  ' "${ACCEPT_LOG}")"
fi

for required in 'Orchid API' '2026-07-01' 'p95' '420 ms' '190 ms'; do
  if [[ "${reply}" != *"${required}"* ]]; then
    echo "expect fail: English rewrite lost required fact: ${required}" >&2
    exit 1
  fi
done
if printf '%s' "${reply}" | grep -Eiq "in today's|rapidly evolving landscape|it is important to note|pivotal testament|in conclusion"; then
  echo "expect fail: English rewrite retained the seeded AI-writing cluster: ${reply}" >&2
  exit 1
fi
if printf '%s' "${reply}" | grep -Eiq '\bI\b|\bwe\b'; then
  echo "expect fail: English rewrite invented first-person voice: ${reply}" >&2
  exit 1
fi

echo "OK English route loaded both editors and preserved facts while removing the seeded pattern cluster"
