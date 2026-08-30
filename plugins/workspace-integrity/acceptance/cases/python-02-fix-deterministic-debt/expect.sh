#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal "Domain Completion Guard|pythonJson"
node -e 'const fs=require("node:fs"); const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(value.fixed!==true) process.exit(1)' "${ACCEPT_WORKSPACE}/invalid.json"
echo "OK deterministic domain debt blocked completion until the file was repaired"
