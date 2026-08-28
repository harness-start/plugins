#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'visual-explanation'

if [ "${ACCEPT_HOST}" = "claude" ]; then
  grep -Eq 'SkillTool returning.*skill (professional-writing:)?visual-explanation' "${ACCEPT_LOG}"
  reply="$(sed -n '1,100p' "${ACCEPT_LOG}")"
else
  grep -Eq '/skills/visual-explanation/SKILL\.md' "${ACCEPT_LOG}"
  reply="$(awk '$0 == "codex" { in_reply = 1; next } in_reply { sub(/^> /, ""); print }' "${ACCEPT_LOG}")"
fi

for required in Browser API Cache Database; do
  if [[ "${reply}" != *"${required}"* ]]; then
    echo "Acceptance failed: the visual response omitted a required node: ${required}" >&2
    exit 1
  fi
done
if printf '%s' "${reply}" | grep -Eiq '<html|<!doctype|\.html'; then
  echo "Acceptance failed: the bounded visual response created or proposed HTML" >&2
  exit 1
fi

extra="$(find "${ACCEPT_WORKSPACE}" -path "${ACCEPT_WORKSPACE}/.git" -prune -o -type f ! -name .gitkeep -print)"
if [ -n "${extra}" ]; then
  echo "Acceptance failed: the visual response created a file: ${extra}" >&2
  exit 1
fi

echo "PASS: the visual response preserved the four-node data flow in one bounded inline view"
