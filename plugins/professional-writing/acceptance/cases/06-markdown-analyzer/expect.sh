#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'Markdown prose.*writing-markdown-ai-style.*analy'
require_file_exists "${ACCEPT_WORKSPACE}/release-note.md"

if [ "${ACCEPT_HOST}" = "claude" ]; then
  for skill in writing-english-prose writing-markdown-ai-style; do
    grep -Eq "SkillTool returning.*skill ([^ ]+:)?${skill}" "${ACCEPT_LOG}"
  done

  # Claude's debug log records tool dispatches but omits Bash command text.
  analyzer_runs="$(grep -Ec 'tool_dispatch_start tool=Bash' "${ACCEPT_LOG}" || true)"
  claude_reply="$(sed '/^===== claude-debug-file =====$/q' "${ACCEPT_LOG}")"
  printf '%s' "${claude_reply}" | grep -Eiq \
    '(analy[sz]er|before/after).*[1-9][0-9]*.*(finding|total)|[1-9][0-9]*.*(analy[sz]er|finding)'
  printf '%s' "${claude_reply}" | grep -Eiq \
    '(analy[sz]er|before/after).*(0|zero).*(finding|total)|(0|zero).*(finding|total)'
else
  for skill in writing-english-prose writing-markdown-ai-style; do
    grep -Eq "/skills/${skill}/SKILL\\.md" "${ACCEPT_LOG}"
  done
  analyzer_runs="$(grep -Ec 'analyze-ai-style\.mjs' "${ACCEPT_LOG}" || true)"
fi

if [ "${analyzer_runs}" -lt 2 ]; then
  echo "expect fail: expected before/after analyzer evidence, got ${analyzer_runs} log occurrences" >&2
  exit 1
fi

note="$(cat "${ACCEPT_WORKSPACE}/release-note.md")"
for required in '# Nimbus CLI release' 'Nimbus CLI' '2026-07-02' '830 ms' '310 ms' 'npm run verify' 'https://example.invalid/nimbus'; do
  if [[ "${note}" != *"${required}"* ]]; then
    echo "expect fail: Markdown rewrite lost protected content: ${required}" >&2
    exit 1
  fi
done
if printf '%s' "${note}" | grep -Eiq "in today's|rapidly evolving landscape|it is important to note|robust and transformative|in conclusion"; then
  echo "expect fail: Markdown rewrite retained the seeded AI-writing cluster" >&2
  exit 1
fi

extra="$(find "${ACCEPT_WORKSPACE}" \
  -path "${ACCEPT_WORKSPACE}/.git" -prune -o \
  -type f ! -path "${ACCEPT_WORKSPACE}/release-note.md" -print)"
if [ -n "${extra}" ]; then
  echo "expect fail: Markdown scenario created unrelated files: ${extra}" >&2
  exit 1
fi

echo "OK Markdown route preserved protected content and produced before/after analyzer evidence"
