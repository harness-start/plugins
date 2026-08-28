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

sessions_dir="${ACCEPT_WORKSPACE}/.agent-activity-audit/sessions"
local_gitignore="${ACCEPT_WORKSPACE}/.agent-activity-audit/.gitignore"
if [ ! -d "${sessions_dir}" ]; then
  echo "expect fail: missing .agent-activity-audit/sessions" >&2
  exit 1
fi
if [ ! -f "${local_gitignore}" ] || [ "$(cat "${local_gitignore}")" != "*" ]; then
  echo "expect fail: .agent-activity-audit/.gitignore must contain *" >&2
  exit 1
fi
if [ "$(cat "${ACCEPT_WORKSPACE}/.gitignore")" != "vendor/" ]; then
  echo "expect fail: project .gitignore was modified" >&2
  exit 1
fi

mapfile -t jsonl_files < <(find "${sessions_dir}" -maxdepth 1 -type f -name '*.jsonl' | sort)
matched=0
for file in "${jsonl_files[@]}"; do
  if grep -Eq '"schema"[[:space:]]*:[[:space:]]*"agent-activity/v1"' "${file}" \
    && grep -Eq '"kind"[[:space:]]*:[[:space:]]*"file"' "${file}" \
    && grep -Eq '"op"[[:space:]]*:[[:space:]]*"(write|update)"' "${file}" \
    && grep -Eq 'src/app\.js' "${file}"; then
    matched=1
    break
  fi
done
if [ "${matched}" -ne 1 ]; then
  echo "expect fail: no agent-activity/v1 file row for src/app.js" >&2
  exit 1
fi

echo "OK agent-activity-audit recorded structured write for src/app.js"
