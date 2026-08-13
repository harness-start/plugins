#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
if grep -Eq 'Do not use tools, write proposal files' "${ACCEPT_LOG}"; then
  echo "expect fail: ordinary subagent was told to abandon tools" >&2
  exit 1
fi
require_file_exists "${ACCEPT_WORKSPACE}/notes.txt"
echo "OK ordinary subagent was not instructed to abandon tools"
