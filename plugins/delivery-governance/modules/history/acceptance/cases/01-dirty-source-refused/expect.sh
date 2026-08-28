#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
test -d "${ACCEPT_WORKSPACE}/source/.git"
test -f "${ACCEPT_WORKSPACE}/source/dirty.txt"
test ! -e "${ACCEPT_WORKSPACE}/target"
git -C "${ACCEPT_WORKSPACE}/source" status --porcelain=v1 | grep -Fq '?? dirty.txt'
grep -Eiq 'source repository is dirty|dirty source' "${ACCEPT_LOG}"
echo "OK dirty source was refused and target stayed absent"
