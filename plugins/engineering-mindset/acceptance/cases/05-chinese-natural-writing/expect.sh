#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'Chinese prose.*humanizer-zh.*shuorenhua.*ai-flavor-remover'

if [ "${ACCEPT_HOST}" = "claude" ]; then
  for skill in humanizer-zh shuorenhua ai-flavor-remover; do
    grep -Eq "SkillTool returning.*skill ([^ ]+:)?${skill}" "${ACCEPT_LOG}"
  done
  reply="$(sed -n '1p' "${ACCEPT_LOG}")"
else
  for skill in humanizer-zh shuorenhua ai-flavor-remover; do
    grep -Eq "/skills/${skill}/SKILL\\.md" "${ACCEPT_LOG}"
  done
  reply="$(awk '
    $0 == "codex" { in_reply = 1; next }
    in_reply && index($0, "北桥服务") && index($0, "2026-07-01") &&
      index($0, "P95") && index($0, "420 ms") && index($0, "190 ms") &&
      index($0, "李遥") { sub(/^> /, ""); print; exit }
  ' "${ACCEPT_LOG}")"
fi

for required in '北桥服务' '2026-07-01' 'P95' '420 ms' '190 ms' '李遥'; do
  if [[ "${reply}" != *"${required}"* ]]; then
    echo "expect fail: Chinese rewrite lost required fact: ${required}" >&2
    exit 1
  fi
done
if printf '%s' "${reply}" | grep -Eq '值得注意的是|赋能|开启.*新篇章|综上所述|不仅仅是.*更是|重要里程碑'; then
  echo "expect fail: Chinese rewrite retained the seeded AI-writing cluster: ${reply}" >&2
  exit 1
fi
if printf '%s' "${reply}" | grep -Eq '(^|[^你])我(们)?'; then
  echo "expect fail: Chinese rewrite invented first-person voice: ${reply}" >&2
  exit 1
fi

echo "OK Chinese route loaded all three editors and preserved facts without invented voice"
