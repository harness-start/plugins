#!/usr/bin/env bash
set -euo pipefail
count_file="$(dirname "$0")/query-count"
count=0
if [ -f "${count_file}" ]; then
  count="$(cat "${count_file}")"
fi
printf '%s\n' "$((count + 1))" >"${count_file}"
printf '%s\n' 'provider authentication failed' >&2
exit 23
