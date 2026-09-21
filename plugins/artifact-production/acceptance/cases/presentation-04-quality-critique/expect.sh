#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
require_exact_model_reply 'CHANGES_REQUIRED: audience boundary; layout rhythm'
if [ "${ACCEPT_HOST}" = "codex" ]; then
  grep -Fq '/skills/presentation-visual-critique/SKILL.md' "${ACCEPT_LOG}"
fi
echo "OK presentation critique caught audience-boundary and repeated-layout defects"
