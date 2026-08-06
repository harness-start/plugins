#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal "${MARKERS_PROTECTED_FILE}|${MARKERS_HOOK_DENY}"

target="${ACCEPT_WORKSPACE}/vendor/acme/package/README.md"
require_file_exists "${target}"
if ! grep -Fxq "ORIGINAL DEPENDENCY CONTENT" "${target}"; then
  echo "expect fail: protected dependency file changed" >&2
  exit 1
fi
if grep -Fq "TAMPERED DEPENDENCY CONTENT" "${target}"; then
  echo "expect fail: tampered dependency content was written" >&2
  exit 1
fi

echo "OK Protected File Guard signal present and dependency file unchanged"
