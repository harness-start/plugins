#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal '\[Artifact Evidence Guard\]|hook: Stop'
require_file_exists "${ACCEPT_WORKSPACE}/result.txt"
grep -Fq 'sha256 does not match' "${ACCEPT_LOG}"

echo "OK mismatched artifact digest was blocked at Stop"
