#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

# Negative host case: short aliases must not open the gate.
# Honesty: must fail-closed on inert logs (no real tools / honesty template).
require_host_session_started

if grep -Fq '----- model refuse (no hook fire) -----' "${ACCEPT_LOG}" \
  || grep -Fq 'session complete without tool calls' "${ACCEPT_LOG}"; then
  echo "expect fail: inert host log (no real tools)" >&2
  exit 1
fi

if grep -Eq '\[first-principles-gate\]|First-principles mode is open|business writes are blocked' "${ACCEPT_LOG}"; then
  echo "expect fail: short alias incorrectly opened first-principles mode" >&2
  exit 1
fi

# Require real tool activity markers that inert templates do not emit as successful work.
if ! grep -Eq 'tool_use|ToolCall|PreToolUse|PostToolUse|permissionDecision|apply_patch|Write|Edit' "${ACCEPT_LOG}"; then
  echo "expect fail: missing real tool activity for short-alias case" >&2
  exit 1
fi

echo "OK first-principles-gate short alias did not open mode"
