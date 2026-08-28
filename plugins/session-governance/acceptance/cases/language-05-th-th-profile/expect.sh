#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal '\[language-output\] profile=th-TH'
target="${ACCEPT_WORKSPACE}/answer.txt"
require_file_exists "${target}"
grep -Fxq 'นี่คือคำตอบภาษาไทยและจะใช้ภาษาที่กำหนดต่อไป' "${target}"

echo "OK th-TH profile produced Thai file and response marker"
