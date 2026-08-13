#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal '\[language-output-governance\] profile=zh-TW'
target="${ACCEPT_WORKSPACE}/answer.txt"
require_file_exists "${target}"
grep -Fxq '語言治理會讓這段回應持續使用繁體中文。' "${target}"

echo "OK zh-TW profile produced Traditional Chinese file and response marker"
