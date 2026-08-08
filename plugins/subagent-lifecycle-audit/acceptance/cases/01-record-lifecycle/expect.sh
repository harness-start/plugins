#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started

trail_root="${ACCEPT_WORKSPACE}/.subagent-lifecycle-audit"
if [ ! -d "${trail_root}/sessions" ]; then
  echo "expect fail: lifecycle sessions directory missing" >&2
  exit 1
fi

mapfile -t trails < <(find "${trail_root}/sessions" -type f -name '*.jsonl' | sort)
if [ "${#trails[@]}" -eq 0 ]; then
  echo "expect fail: no lifecycle JSONL trail" >&2
  exit 1
fi

if ! jq -s -e '
  any(.[];
    .schema == "subagent-lifecycle/v1"
    and .event == "stopped"
    and .correlation == "matched"
    and (.agent_id | type == "string" and length > 0)
    and (.started_at | type == "string")
    and (.ended_at | type == "string")
    and (.duration_ms | type == "number" and . >= 0)
  )
' "${trails[@]}" >/dev/null; then
  echo "expect fail: no matched lifecycle pair with duration" >&2
  jq -s '.' "${trails[@]}" >&2
  exit 1
fi

if jq -s -e '
  any(.[];
    has("agent_prompt") or has("prompt") or has("last_assistant_message")
    or has("command") or has("file_path") or has("tool_input")
    or has("tool_output")
  )
' "${trails[@]}" >/dev/null; then
  echo "expect fail: lifecycle trail contains prohibited work content" >&2
  exit 1
fi

if [ -n "$(git -C "${ACCEPT_WORKSPACE}" status --porcelain)" ]; then
  echo "expect fail: acceptance workspace has tracked changes" >&2
  git -C "${ACCEPT_WORKSPACE}" status --porcelain >&2
  exit 1
fi

echo "OK matched subagent lifecycle recorded without work content"
