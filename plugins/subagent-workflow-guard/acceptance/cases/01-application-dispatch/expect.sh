#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started

if [ "${ACCEPT_HOST}" = "claude" ]; then
  debug_log="${ACCEPT_OUT}/host.claude-debug.log"
  if [ ! -s "${debug_log}" ]; then
    echo "expect fail: missing Claude debug hook trace" >&2
    exit 1
  fi

  mapfile -t agent_tool_ids < <(
    find "${ACCEPT_OUT}/home/.claude/projects" -type f -name '*.jsonl' -print0 2>/dev/null |
      while IFS= read -r -d '' trace; do
        jq -r 'select(.type == "assistant") | .message.content[]? | select(.type == "tool_use" and .name == "Agent") | .id' "${trace}"
      done
  )
  if [ "${#agent_tool_ids[@]}" -ne 1 ] || [ -z "${agent_tool_ids[0]}" ]; then
    echo "expect fail: Claude transcript must contain exactly one real Agent tool call" >&2
    exit 1
  fi
  agent_tool_id="${agent_tool_ids[0]}"

  tool_result_observed=0
  while IFS= read -r -d '' trace; do
    if jq -e -s --arg tool_id "${agent_tool_id}" '
      any(.[];
        .type == "user" and
        any(.message.content[]?;
          .type == "tool_result" and
          .tool_use_id == $tool_id and
          .is_error == true and
          (.content | type == "string") and
          (.content | contains("reason=missing-application"))
        )
      )
    ' "${trace}" >/dev/null 2>&1; then
      tool_result_observed=1
      break
    fi
  done < <(find "${ACCEPT_OUT}/home/.claude/projects" -type f -name '*.jsonl' -print0 2>/dev/null)
  if [ "${tool_result_observed}" -ne 1 ]; then
    echo "expect fail: Agent call has no structured missing-application tool result" >&2
    exit 1
  fi

  deny_receipt_observed=0
  while IFS= read -r receipt; do
    if jq -e --arg tool_id "${agent_tool_id}" '
      .hookSpecificOutput.hookEventName == "PreToolUse" and
      .hookSpecificOutput.permissionDecision == "deny" and
      (.hookSpecificOutput.permissionDecisionReason |
        contains("DENY run=acceptance-run tool=" + $tool_id + " reason=missing-application"))
    ' <<<"${receipt}" >/dev/null 2>&1; then
      deny_receipt_observed=1
      break
    fi
  done < <(awk '/Hook PreToolUse:Agent \(PreToolUse\) success:/{getline; print}' "${debug_log}")
  if [ "${deny_receipt_observed}" -ne 1 ]; then
    echo "expect fail: no structured Agent PreToolUse deny receipt" >&2
    exit 1
  fi

  if grep -Eq 'Hook SubagentStart.*success:' "${debug_log}"; then
    echo "expect fail: denied Claude dispatch still reached SubagentStart" >&2
    exit 1
  fi
else
  observed_subagent=0
  while IFS= read -r -d '' trace; do
    if jq -e -s 'any(.[]; .type == "session_meta" and .payload.thread_source == "subagent" and .payload.source.subagent.thread_spawn.depth == 1)' "${trace}" >/dev/null 2>&1; then
      observed_subagent=1
      break
    fi
  done < <(find "${ACCEPT_OUT}/codex-home/sessions" -type f -name '*.jsonl' -print0 2>/dev/null)
  if [ "${observed_subagent}" -ne 1 ]; then
    echo "expect fail: Codex boundary trace did not contain a real spawned subagent session" >&2
    exit 1
  fi
fi

if [ -n "$(git -C "${ACCEPT_WORKSPACE}" status --porcelain)" ]; then
  echo "expect fail: acceptance workspace was modified" >&2
  git -C "${ACCEPT_WORKSPACE}" status --porcelain >&2
  exit 1
fi

if [ "${ACCEPT_HOST}" = "claude" ]; then
  echo "OK Claude governed dispatch was denied before SubagentStart"
else
  echo "OK Codex host boundary was reproduced: collaboration subagent started without the matched hook seam"
fi
