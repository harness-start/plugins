#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_hook_prompt_signal 'Video Project Delivery Guard.*Project contract violations'
require_hook_prompt_signal 'PLAN_CONTRACT_MISSING'
echo "OK missing plan failed closed at Stop"
