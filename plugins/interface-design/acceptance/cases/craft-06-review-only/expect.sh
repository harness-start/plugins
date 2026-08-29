#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
test "$(sha256sum "${ACCEPT_WORKSPACE}/index.html" | cut -d' ' -f1)" = "faa027c9d45d8de7d414881b38fafa27dc6d0897f732cbaf4ff2ee75bd3e49a6"
test "$(sha256sum "${ACCEPT_WORKSPACE}/styles.css" | cut -d' ' -f1)" = "0db02faeeb4df446a1e6b088d98113fb6b311d6c53f28b97e65b69c6c51741f6"
grep -Eq '\b(changes_required|unverified)\b' "${ACCEPT_LOG}"
grep -Eq '\b(blocker|major)\b' "${ACCEPT_LOG}"
grep -Eq 'styles\.css:[0-9]+' "${ACCEPT_LOG}"
grep -Eiq 'evidence|recovery|恢复' "${ACCEPT_LOG}"
grep -Eiq 'first[- ]read|pre-contract' "${ACCEPT_LOG}"
grep -Eiq 'retell|recall' "${ACCEPT_LOG}"
grep -Eiq 'communication core|signature cue|intended target' "${ACCEPT_LOG}"

echo "OK critique stayed read-only and returned a two-pass retell with anchored evidence and a bounded verdict"
