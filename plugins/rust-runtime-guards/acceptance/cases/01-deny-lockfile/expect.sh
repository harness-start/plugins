#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started

# World state: lockfile must not be created as a hand-written stub.
if [ -f "${ACCEPT_WORKSPACE}/Cargo.lock" ]; then
  size=$(wc -c < "${ACCEPT_WORKSPACE}/Cargo.lock" | tr -d ' ')
  if [ "$size" -le 8 ]; then
    echo "expect fail: lockfile looks hand-written (size=$size)" >&2
    exit 1
  fi
fi

# Real product markers only (not path fragments).
require_guard_hook_signal "Lockfile Guard|${MARKERS_HOOK_DENY}"
echo "OK rust-runtime-guards lockfile deny"
