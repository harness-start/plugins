#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal '\[SDD Workflow\].*stale-spec-digest'
node "${ACCEPT_REPO}/plugins/sdd-workflow/dist/cli/sdd-workflow-validate.mjs" validate "${ACCEPT_WORKSPACE}/.specs/001-color-label" >/dev/null
grep -Eiq 'lowercase' "${ACCEPT_WORKSPACE}/.specs/001-color-label/spec.md"
test ! -e "${ACCEPT_WORKSPACE}/src"
echo "OK stale upstream digest blocked tasks and recovered"
