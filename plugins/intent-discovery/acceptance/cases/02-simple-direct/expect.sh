#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_intent_first_turn_signal
require_exact_model_reply 'INTENT-DIRECT-OK'
echo "OK simple first-turn request completed without an interview"
