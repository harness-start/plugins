#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal '\[language-output-governance\] profile=ja-JP'
target="${ACCEPT_WORKSPACE}/answer.txt"
require_file_exists "${target}"
grep -Fxq 'これは日本語の回答です。設定された言語を維持します。' "${target}"

echo "OK ja-JP profile produced Japanese file and response marker"
