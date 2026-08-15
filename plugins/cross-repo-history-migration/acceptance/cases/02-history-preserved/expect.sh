#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_file_exists "${ACCEPT_WORKSPACE}/preflight.json"
require_file_exists "${ACCEPT_WORKSPACE}/execute.json"
require_file_exists "${ACCEPT_WORKSPACE}/target/packages/widget/data.txt"
test ! -e "${ACCEPT_WORKSPACE}/target/unrelated.txt"
test "$(git -C "${ACCEPT_WORKSPACE}/target" rev-list --count HEAD)" = "2"
test "$(git -C "${ACCEPT_WORKSPACE}/target" branch --show-current)" = "main"
test -z "$(git -C "${ACCEPT_WORKSPACE}/target" remote)"
test -z "$(git -C "${ACCEPT_WORKSPACE}/source" status --porcelain=v1)"
node -e 'const fs=require("fs"); for (const p of process.argv.slice(1)) { const x=JSON.parse(fs.readFileSync(p,"utf8")); if (!x.ok || !x.sessionId || !x.triggerFrom || !x.data.planDigest) process.exit(1); }' "${ACCEPT_WORKSPACE}/preflight.json" "${ACCEPT_WORKSPACE}/execute.json"
echo "OK selected content and two-commit history were preserved"
