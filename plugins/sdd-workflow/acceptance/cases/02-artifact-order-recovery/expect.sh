#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal '\[SDD Workflow\].*(tasks.md is blocked|Create spec.md first)'
for name in spec.md plan.md tasks.md; do require_file_exists "${ACCEPT_WORKSPACE}/.specs/001-greeting/${name}"; done
node "${ACCEPT_REPO}/plugins/sdd-workflow/dist/cli/sdd-workflow-validate.mjs" validate "${ACCEPT_WORKSPACE}/.specs/001-greeting" >/dev/null
test ! -e "${ACCEPT_WORKSPACE}/src"
echo "OK artifact-order denial recovered to a valid chain"
