#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_guard_hook_signal 'Logo Project Delivery Guard.*PLAN_STAGE_WRITER_REQUIRED|hook: PreToolUse'
grep -Fq '"targetStage":"release"' "${ACCEPT_WORKSPACE}/artifacts/logo/demo/plan.contract.json"
echo "OK existing release plan downgrade denied"
