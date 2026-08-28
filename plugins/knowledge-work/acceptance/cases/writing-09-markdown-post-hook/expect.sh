#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_tool_feedback_signal 'Markdown AI-style findings(.|\n)*en-(canned-closer|assistant-residue)-[0-9]+ hook-note\.md:3'
require_file_exists "${ACCEPT_WORKSPACE}/hook-note.md"

expected=$'# Hook note\n\nIn conclusion, I hope this helps.'
actual="$(cat "${ACCEPT_WORKSPACE}/hook-note.md")"
if [ "${actual}" != "${expected}" ]; then
  echo "expect fail: direct Markdown edit did not preserve the exact requested file" >&2
  exit 1
fi

echo "PASS: direct Markdown write triggered deterministic PostToolUse findings"
