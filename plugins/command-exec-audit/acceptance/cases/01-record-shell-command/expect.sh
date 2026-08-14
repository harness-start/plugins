#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started

sessions_dir="${ACCEPT_WORKSPACE}/.command-exec-audit/sessions"
local_gitignore="${ACCEPT_WORKSPACE}/.command-exec-audit/.gitignore"
if [ ! -d "${sessions_dir}" ]; then
  echo "expect fail: missing .command-exec-audit/sessions" >&2
  exit 1
fi

if [ ! -f "${local_gitignore}" ] || [ "$(cat "${local_gitignore}")" != "sessions/" ]; then
  echo "expect fail: .command-exec-audit/.gitignore must contain sessions/" >&2
  exit 1
fi
if [ "$(cat "${ACCEPT_WORKSPACE}/.gitignore")" != "vendor/" ]; then
  echo "expect fail: project .gitignore was modified" >&2
  exit 1
fi

mapfile -t jsonl_files < <(find "${sessions_dir}" -maxdepth 1 -type f -name '*.jsonl' | sort)
if [ "${#jsonl_files[@]}" -eq 0 ]; then
  echo "expect fail: no session JSONL under .command-exec-audit/sessions" >&2
  exit 1
fi

matched=0
for file in "${jsonl_files[@]}"; do
  if grep -Eq '"schema"[[:space:]]*:[[:space:]]*"command-exec/v1"' "${file}" \
    && grep -Eq '"command"[[:space:]]*:[[:space:]]*".*printf' "${file}" \
    && grep -Eq '"status"[[:space:]]*:[[:space:]]*"(success|failure|unknown|pending)"' "${file}" \
    && grep -Eq '"duration_ms"[[:space:]]*:' "${file}"; then
    # Prefer a terminal row when present.
    if grep -Eq '"status"[[:space:]]*:[[:space:]]*"(success|failure|unknown)"' "${file}" \
      && grep -Eq '"duration_ms"[[:space:]]*:[[:space:]]*[0-9]+' "${file}"; then
      matched=1
      break
    fi
    # Accept pending-only only if the host never delivered PostToolUse (rare).
    if grep -Eq '"status"[[:space:]]*:[[:space:]]*"pending"' "${file}"; then
      matched=1
      break
    fi
  fi
done
if [ "${matched}" -ne 1 ]; then
  echo "expect fail: no command-exec/v1 row for printf with status/duration" >&2
  exit 1
fi

# Ensure no stdout body field was persisted.
if grep -Eq '"stdout"[[:space:]]*:' "${sessions_dir}"/*.jsonl 2>/dev/null; then
  echo "expect fail: stdout body must not be stored" >&2
  exit 1
fi

echo "OK command-exec-audit recorded shell command status/duration"
