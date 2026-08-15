#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
node "${ACCEPT_REPO}/plugins/sdd-workflow/dist/cli/sdd-workflow-validate.mjs" validate "${ACCEPT_WORKSPACE}/.specs/001-greeting" >/dev/null
cmp "${ACCEPT_WORKSPACE}/baseline/spec.md" "${ACCEPT_WORKSPACE}/.specs/001-greeting/spec.md"
cmp "${ACCEPT_WORKSPACE}/baseline/plan.md" "${ACCEPT_WORKSPACE}/.specs/001-greeting/plan.md"
cmp "${ACCEPT_WORKSPACE}/baseline/tasks.md" "${ACCEPT_WORKSPACE}/.specs/001-greeting/tasks.md"
cmp "${ACCEPT_WORKSPACE}/baseline/first.mjs" "${ACCEPT_WORKSPACE}/src/first.mjs"
require_file_exists "${ACCEPT_WORKSPACE}/src/second.mjs"
require_file_exists "${ACCEPT_WORKSPACE}/test/second.test.mjs"
grep -q 'second' "${ACCEPT_WORKSPACE}/src/second.mjs"
node --test "${ACCEPT_WORKSPACE}/test/first.test.mjs" "${ACCEPT_WORKSPACE}/test/second.test.mjs" >/dev/null
echo "OK resumed from valid artifacts and implemented only the remaining task"
