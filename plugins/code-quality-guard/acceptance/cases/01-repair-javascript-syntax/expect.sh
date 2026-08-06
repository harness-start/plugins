#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal "${MARKERS_CODE_QUALITY}"

target="${ACCEPT_WORKSPACE}/src/app.js"
require_file_exists "${target}"
if ! grep -Fxq "export const answer = 42;" "${target}"; then
  echo "expect fail: JavaScript file was not repaired to exact content" >&2
  exit 1
fi
node --check "${target}"

echo "OK Code Quality Guard signal present and JavaScript syntax repaired"
