#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started

target="${ACCEPT_WORKSPACE}/src/app.js"
require_file_exists "${target}"
if ! grep -Eq 'value\s*=\s*1' "${target}"; then
  echo "expect fail: src/app.js was not updated to value = 1" >&2
  exit 1
fi

sessions_dir="${ACCEPT_WORKSPACE}/.file-access-audit/sessions"
if [ ! -d "${sessions_dir}" ]; then
  echo "expect fail: missing .file-access-audit/sessions" >&2
  exit 1
fi

mapfile -t jsonl_files < <(find "${sessions_dir}" -maxdepth 1 -type f -name '*.jsonl' | sort)
if [ "${#jsonl_files[@]}" -eq 0 ]; then
  echo "expect fail: no session JSONL under .file-access-audit/sessions" >&2
  exit 1
fi

matched=0
for file in "${jsonl_files[@]}"; do
  if grep -Eq '"schema"[[:space:]]*:[[:space:]]*"file-access/v1"' "${file}" \
    && grep -Eq '"op"[[:space:]]*:[[:space:]]*"(write|update)"' "${file}" \
    && grep -Eq 'src/app\.js' "${file}"; then
    matched=1
    break
  fi
done
if [ "${matched}" -ne 1 ]; then
  echo "expect fail: no file-access/v1 write/update row for src/app.js" >&2
  exit 1
fi

echo "OK file-access-audit recorded structured write for src/app.js"
