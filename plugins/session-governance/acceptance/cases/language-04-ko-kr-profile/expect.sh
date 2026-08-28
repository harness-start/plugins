#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal '\[language-output\] profile=ko-KR'
target="${ACCEPT_WORKSPACE}/answer.txt"
require_file_exists "${target}"
grep -Fxq '이것은 한국어 응답이며 설정된 언어를 계속 유지합니다.' "${target}"

echo "OK ko-KR profile produced Korean file and response marker"
