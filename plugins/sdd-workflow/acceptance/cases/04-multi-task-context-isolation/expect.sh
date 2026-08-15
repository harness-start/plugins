#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
test ! -e "${ACCEPT_WORKSPACE}/.specs"
test "$(cat "${ACCEPT_WORKSPACE}/lanes/distractor/untouched.txt")" = "do not inspect or modify"
test "$(cat "${ACCEPT_WORKSPACE}/lanes/orchard/request.md")" = "Copy this token exactly: ORCHARD-7D3A"
test "$(cat "${ACCEPT_WORKSPACE}/lanes/harbor/request.md")" = "Copy this token exactly: HARBOR-92C1"

expected_orchard_brief="$(cat <<'BRIEF'
Task Brief
brief-id: orchard-8f3c
Lane: orchard_lane
Scope: Return the one Result Card below.
Tool-Policy: FORBID_ALL_TOOLS
File-Policy: Do not read or write files.
Delegation-Policy: Do not delegate or spawn agents.
Context-Policy: Use only this brief; ignore ambient context.
Output-Policy: Return exactly the next line, byte-for-byte, with no other text.
Result Card: ORCHARD_READY brief-id=orchard-8f3c
BRIEF
)"
expected_harbor_brief="$(cat <<'BRIEF'
Task Brief
brief-id: harbor-2a7d
Lane: harbor_lane
Scope: Return the one Result Card below.
Tool-Policy: FORBID_ALL_TOOLS
File-Policy: Do not read or write files.
Delegation-Policy: Do not delegate or spawn agents.
Context-Policy: Use only this brief; ignore ambient context.
Output-Policy: Return exactly the next line, byte-for-byte, with no other text.
Result Card: HARBOR_READY brief-id=harbor-2a7d
BRIEF
)"
orchard_suffix='Return exactly the line `Result Card: ORCHARD_READY brief-id=orchard-8f3c`.'
harbor_suffix='Return exactly the line `Result Card: HARBOR_READY brief-id=harbor-2a7d`.'
accepted_orchard_brief="${expected_orchard_brief}"$'\n\n'"${orchard_suffix}"
accepted_harbor_brief="${expected_harbor_brief}"$'\n\n'"${harbor_suffix}"
compact_orchard_brief="${expected_orchard_brief}"$'\n'"${orchard_suffix}"
compact_harbor_brief="${expected_harbor_brief}"$'\n'"${harbor_suffix}"
spaced_orchard_base="${expected_orchard_brief/Task Brief$'\n'/Task Brief$'\n\n'}"
spaced_harbor_base="${expected_harbor_brief/Task Brief$'\n'/Task Brief$'\n\n'}"
spaced_compact_orchard_brief="${spaced_orchard_base}"$'\n'"${orchard_suffix}"
spaced_compact_harbor_brief="${spaced_harbor_base}"$'\n'"${harbor_suffix}"
spaced_orchard_brief="${accepted_orchard_brief/Task Brief$'\n'/Task Brief$'\n\n'}"
spaced_harbor_brief="${accepted_harbor_brief/Task Brief$'\n'/Task Brief$'\n\n'}"

if [[ "${ACCEPT_HOST}" == "claude" ]]; then
  claude_transcript="$(find "${ACCEPT_OUT}/home/.claude/projects" -type f -name '*.jsonl' ! -path '*/subagents/*' | head -n 1)"
  test -n "${claude_transcript}"
  agent_calls="$(jq -s '[.[] | select(.type == "assistant") | .message.content[]? | select(.type == "tool_use" and .name == "Agent")]' "${claude_transcript}")"
  test "$(jq 'length' <<<"${agent_calls}")" -eq 2
  claude_evidence="$(jq -sc \
    --arg orchard "${expected_orchard_brief}" \
    --arg orchardAccepted "${accepted_orchard_brief}" \
    --arg orchardCompact "${compact_orchard_brief}" \
    --arg orchardSpacedBase "${spaced_orchard_base}" \
    --arg orchardSpacedCompact "${spaced_compact_orchard_brief}" \
    --arg orchardSpaced "${spaced_orchard_brief}" \
    --arg harbor "${expected_harbor_brief}" \
    --arg harborAccepted "${accepted_harbor_brief}" \
    --arg harborCompact "${compact_harbor_brief}" \
    --arg harborSpacedBase "${spaced_harbor_base}" \
    --arg harborSpacedCompact "${spaced_compact_harbor_brief}" \
    --arg harborSpaced "${spaced_harbor_brief}" '
    [to_entries[]
      | .key as $index
      | .value.message.content[]?
      | select(.type == "tool_use" and .name == "Agent")
      | {index: $index, id, prompt: .input.prompt}] as $calls
    | ($calls | map(select(.prompt == $orchard or .prompt == $orchardAccepted or .prompt == $orchardCompact or .prompt == $orchardSpacedBase or .prompt == $orchardSpacedCompact or .prompt == $orchardSpaced))) as $orchard_calls
    | ($calls | map(select(.prompt == $harbor or .prompt == $harborAccepted or .prompt == $harborCompact or .prompt == $harborSpacedBase or .prompt == $harborSpacedCompact or .prompt == $harborSpaced))) as $harbor_calls
    | [to_entries[]
      | .key as $index
      | .value as $event
      | select(
          ($orchard_calls | length) == 1
          and $index > $orchard_calls[0].index
          and $event.type == "user"
          and any($event.message.content[]?;
            .type == "tool_result"
            and .tool_use_id == $orchard_calls[0].id
            and ((.is_error // false) == false)
            and (([.content[]? | select(.type == "text") | .text] | first // "")
              == "Result Card: ORCHARD_READY brief-id=orchard-8f3c"))
        )
      | $index] as $orchard_evidence
    | [to_entries[]
      | .key as $index
      | .value as $event
      | select(
          ($harbor_calls | length) == 1
          and $index > $harbor_calls[0].index
          and $event.type == "user"
          and any($event.message.content[]?;
            .type == "tool_result"
            and .tool_use_id == $harbor_calls[0].id
            and ((.is_error // false) == false)
            and (([.content[]? | select(.type == "text") | .text] | first // "")
              == "Result Card: HARBOR_READY brief-id=harbor-2a7d"))
        )
      | $index] as $harbor_evidence
    | ($orchard_evidence + $harbor_evidence) as $completion_evidence
    | {
        calls: ($calls | length),
        orchard_calls: ($orchard_calls | length),
        harbor_calls: ($harbor_calls | length),
        orchard_cards: ($orchard_evidence | length),
        harbor_cards: ($harbor_evidence | length),
        dispatched_before_completion: (
          ($completion_evidence | length) == 0
          or (($calls | map(.index) | max) < ($completion_evidence | min))
        )
      }
  ' "${claude_transcript}")"
  test "$(jq -r '.calls' <<<"${claude_evidence}")" -eq 2
  test "$(jq -r '.orchard_calls' <<<"${claude_evidence}")" -eq 1
  test "$(jq -r '.harbor_calls' <<<"${claude_evidence}")" -eq 1
  test "$(jq -r '.dispatched_before_completion' <<<"${claude_evidence}")" = "true"
  orchard_prompt="$(jq -r '.[] | select(.input.prompt | contains("brief-id: orchard-8f3c")) | .input.prompt' <<<"${agent_calls}")"
  harbor_prompt="$(jq -r '.[] | select(.input.prompt | contains("brief-id: harbor-2a7d")) | .input.prompt' <<<"${agent_calls}")"
  [[ "${orchard_prompt}" == "${expected_orchard_brief}" || "${orchard_prompt}" == "${accepted_orchard_brief}" || "${orchard_prompt}" == "${compact_orchard_brief}" || "${orchard_prompt}" == "${spaced_orchard_base}" || "${orchard_prompt}" == "${spaced_compact_orchard_brief}" || "${orchard_prompt}" == "${spaced_orchard_brief}" ]]
  [[ "${harbor_prompt}" == "${expected_harbor_brief}" || "${harbor_prompt}" == "${accepted_harbor_brief}" || "${harbor_prompt}" == "${compact_harbor_brief}" || "${harbor_prompt}" == "${spaced_harbor_base}" || "${harbor_prompt}" == "${spaced_compact_harbor_brief}" || "${harbor_prompt}" == "${spaced_harbor_brief}" ]]

  orchard_cards="$(jq -r '.orchard_cards' <<<"${claude_evidence}")"
  harbor_cards="$(jq -r '.harbor_cards' <<<"${claude_evidence}")"

  mapfile -t claude_children < <(find "${ACCEPT_OUT}/home/.claude/projects" -type f -path '*/subagents/*.jsonl' | sort)
  claude_child_count="${#claude_children[@]}"
  child_orchard=0
  child_harbor=0
  child_orchard_cards=0
  child_harbor_cards=0
  child_tool_calls=0
  child_prompt_violations=0
  for child in "${claude_children[@]}"; do
    child_tools="$(jq -s '[.[] | select(.type == "assistant") | .message.content[]? | select(.type == "tool_use")] | length' "${child}")"
    child_tool_calls=$((child_tool_calls + child_tools))
    child_user_prompts="$(jq -sc '[.[] | select(.type == "user") | .message.content | select(type == "string")]' "${child}")"
    child_user_prompt_count="$(jq 'length' <<<"${child_user_prompts}")"
    first_prompt="$(jq -r 'first // ""' <<<"${child_user_prompts}")"
    if [[ "${child_user_prompt_count}" -ne 1 ]]; then
      child_prompt_violations=$((child_prompt_violations + 1))
    fi
    assistant_texts="$(jq -sc '[.[] | select(.type == "assistant") | .message.content[]? | select(.type == "text") | .text]' "${child}")"
    assistant_text_count="$(jq 'length' <<<"${assistant_texts}")"
    response_text="$(jq -r 'if length == 1 then .[0] else "" end' <<<"${assistant_texts}")"
    if [[ "${first_prompt}" == "${expected_orchard_brief}" || "${first_prompt}" == "${accepted_orchard_brief}" || "${first_prompt}" == "${compact_orchard_brief}" || "${first_prompt}" == "${spaced_orchard_base}" || "${first_prompt}" == "${spaced_compact_orchard_brief}" || "${first_prompt}" == "${spaced_orchard_brief}" ]]; then
      child_orchard=$((child_orchard + 1))
      if [[ "${assistant_text_count}" -eq 1 && "${response_text}" == "Result Card: ORCHARD_READY brief-id=orchard-8f3c" ]]; then
        child_orchard_cards=$((child_orchard_cards + 1))
      fi
    elif [[ "${first_prompt}" == "${expected_harbor_brief}" || "${first_prompt}" == "${accepted_harbor_brief}" || "${first_prompt}" == "${compact_harbor_brief}" || "${first_prompt}" == "${spaced_harbor_base}" || "${first_prompt}" == "${spaced_compact_harbor_brief}" || "${first_prompt}" == "${spaced_harbor_brief}" ]]; then
      child_harbor=$((child_harbor + 1))
      if [[ "${assistant_text_count}" -eq 1 && "${response_text}" == "Result Card: HARBOR_READY brief-id=harbor-2a7d" ]]; then
        child_harbor_cards=$((child_harbor_cards + 1))
      fi
    else
      child_prompt_violations=$((child_prompt_violations + 1))
    fi
  done
  if [[ -f "${ACCEPT_WORKSPACE}/verification.txt" ]]; then
    test "${claude_child_count}" -eq 2
    test "${child_orchard}" -eq 1
    test "${child_harbor}" -eq 1
    test "${child_tool_calls}" -eq 0
    test "${child_prompt_violations}" -eq 0
    test "${child_orchard_cards}" -eq 1
    test "${child_harbor_cards}" -eq 1
    test "${orchard_cards}" -eq 1
    test "${harbor_cards}" -eq 1
    test ! -e "${ACCEPT_WORKSPACE}/rejection.txt"
    test "$(git -C "${ACCEPT_WORKSPACE}" status --porcelain --untracked-files=all)" = "?? verification.txt"
    test "$(cat "${ACCEPT_WORKSPACE}/verification.txt")" = $'parent verified bounded workers\nORCHARD_READY\nHARBOR_READY'
    echo "OK Claude directly delivered two concurrent briefs to tool-free child transcripts"
  else
    [[ "${claude_child_count}" -ne 2 \
      || "${child_orchard}" -ne 1 \
      || "${child_harbor}" -ne 1 \
      || "${child_tool_calls}" -gt 0 \
      || "${child_prompt_violations}" -gt 0 \
      || "${child_orchard_cards}" -ne 1 \
      || "${child_harbor_cards}" -ne 1 \
      || "${orchard_cards}" -ne 1 \
      || "${harbor_cards}" -ne 1 ]]
    require_file_exists "${ACCEPT_WORKSPACE}/rejection.txt"
    test "$(git -C "${ACCEPT_WORKSPACE}" status --porcelain --untracked-files=all)" = "?? rejection.txt"
    test "$(cat "${ACCEPT_WORKSPACE}/rejection.txt")" = "parent rejected unverified workers"
    echo "OK Claude parent failed closed on a missing exact Agent result"
  fi
  exit 0
fi

mapfile -t transcripts < <(find "${ACCEPT_OUT}/codex-home/sessions" -type f -name '*.jsonl' | sort)
test "${#transcripts[@]}" -ge 1
parent_transcript=""
for transcript in "${transcripts[@]}"; do
  if jq -se '(.[0].payload.source | type) != "object" or (.[0].payload.source | has("subagent") | not)' "${transcript}" >/dev/null; then
    parent_transcript="${transcript}"
    break
  fi
done
test -n "${parent_transcript}"
parent_session_id="$(jq -sr '.[0].payload.session_id' "${parent_transcript}")"
test -n "${parent_session_id}"

jq -se -f "${ACCEPT_REPO}/plugins/sdd-workflow/acceptance/lib/codex-wait-receipt.jq" "${parent_transcript}" >/dev/null
wait_timed_out="$(jq -sr '
  ([.[] | select(.type == "response_item" and .payload.type == "function_call" and .payload.name == "wait_agent")] | first) as $wait
  | ([.[] | select(
      .type == "response_item"
      and .payload.type == "function_call_output"
      and .payload.call_id == $wait.payload.call_id)
      | (.payload.output | fromjson?).timed_out] | first // true)
' "${parent_transcript}")"
jq -se \
  --arg orchard "${expected_orchard_brief}" \
  --arg orchardAccepted "${accepted_orchard_brief}" \
  --arg orchardCompact "${compact_orchard_brief}" \
  --arg orchardSpacedBase "${spaced_orchard_base}" \
  --arg orchardSpacedCompact "${spaced_compact_orchard_brief}" \
  --arg orchardSpaced "${spaced_orchard_brief}" \
  --arg harbor "${expected_harbor_brief}" \
  --arg harborAccepted "${accepted_harbor_brief}" \
  --arg harborCompact "${compact_harbor_brief}" \
  --arg harborSpacedBase "${spaced_harbor_base}" \
  --arg harborSpacedCompact "${spaced_compact_harbor_brief}" \
  --arg harborSpaced "${spaced_harbor_brief}" '
  [.[] | select(.type == "response_item" and .payload.type == "function_call" and .payload.name == "spawn_agent") | (.payload.arguments | fromjson)] as $calls
  | all($calls[];
      .fork_turns == "none"
      and (.message | length) > 0
      and (.message | length) < 1024)
  and any($calls[]; .task_name == "orchard_lane" and (.message == $orchard or .message == $orchardAccepted or .message == $orchardCompact or .message == $orchardSpacedBase or .message == $orchardSpacedCompact or .message == $orchardSpaced))
  and any($calls[]; .task_name == "harbor_lane" and (.message == $harbor or .message == $harborAccepted or .message == $harborCompact or .message == $harborSpacedBase or .message == $harborSpacedCompact or .message == $harborSpaced))
' "${parent_transcript}" >/dev/null

declare -A child_by_lane=()
declare -A child_session_ids=()
descendant_count=0
direct_child_count=0
child_structure_violations=0
for transcript in "${transcripts[@]}"; do
  depth="$(jq -sr 'if (.[0].payload.source | type) == "object" then (.[0].payload.source.subagent.thread_spawn.depth? // 0) else 0 end' "${transcript}")"
  direct_parent="$(jq -sr 'if (.[0].payload.source | type) == "object" then (.[0].payload.source.subagent.thread_spawn.parent_thread_id? // "") else "" end' "${transcript}")"
  if [[ "${depth}" -eq 1 && "${direct_parent}" == "${parent_session_id}" ]]; then
    direct_child_count=$((direct_child_count + 1))
    child_session_id="$(jq -sr '.[0].payload.id' "${transcript}")"
    child_session_ids[${child_session_id}]=1
    lane="$(jq -sr '.[0].payload.source.subagent.thread_spawn.agent_path | split("/") | last' "${transcript}")"
    if [[ ("${lane}" == "orchard_lane" || "${lane}" == "harbor_lane") && -z "${child_by_lane[${lane}]:-}" ]]; then
      child_by_lane[${lane}]="${transcript}"
    else
      child_structure_violations=$((child_structure_violations + 1))
    fi
  fi
done

for transcript in "${transcripts[@]}"; do
  depth="$(jq -sr 'if (.[0].payload.source | type) == "object" then (.[0].payload.source.subagent.thread_spawn.depth? // 0) else 0 end' "${transcript}")"
  direct_parent="$(jq -sr 'if (.[0].payload.source | type) == "object" then (.[0].payload.source.subagent.thread_spawn.parent_thread_id? // "") else "" end' "${transcript}")"
  if [[ "${depth}" -gt 1 && -n "${child_session_ids[${direct_parent}]:-}" ]]; then
    descendant_count=$((descendant_count + 1))
  fi
done

brief_delivered_before_action() {
  local transcript="${1:?transcript required}" expected="${2:?expected brief required}" accepted="${3:?accepted brief required}" compact="${4:?compact brief required}" spaced_base="${5:?spaced base required}" spaced_compact="${6:?spaced compact required}" spaced="${7:?spaced brief required}"
  jq -se --arg expected "${expected}" --arg accepted "${accepted}" --arg compact "${compact}" --arg spacedBase "${spaced_base}" --arg spacedCompact "${spaced_compact}" --arg spaced "${spaced}" '
    (to_entries | map(select(
      .value.type == "response_item"
      and (
        .value.payload.type == "function_call"
        or (.value.payload.type == "message" and .value.payload.role == "assistant")
      )
    )) | first | .key // length) as $first_action
    | [to_entries[]
        | select(.value.type == "response_item" and .value.payload.type == "agent_message")
        | {index: .key, content: [.value.payload.content[]? | select(.type == "encrypted_content") | .encrypted_content]}
        | select((.content | length) > 0)
      ] as $deliveries
    | ($deliveries | length) == 1
      and $deliveries[0].index < $first_action
      and ($deliveries[0].content == [$expected] or $deliveries[0].content == [$accepted] or $deliveries[0].content == [$compact] or $deliveries[0].content == [$spacedBase] or $deliveries[0].content == [$spacedCompact] or $deliveries[0].content == [$spaced])
  ' "${transcript}" >/dev/null
}

orchard_delivered=0
harbor_delivered=0
if [[ -n "${child_by_lane[orchard_lane]:-}" ]] && brief_delivered_before_action "${child_by_lane[orchard_lane]}" "${expected_orchard_brief}" "${accepted_orchard_brief}" "${compact_orchard_brief}" "${spaced_orchard_base}" "${spaced_compact_orchard_brief}" "${spaced_orchard_brief}"; then
  orchard_delivered=1
fi
if [[ -n "${child_by_lane[harbor_lane]:-}" ]] && brief_delivered_before_action "${child_by_lane[harbor_lane]}" "${expected_harbor_brief}" "${accepted_harbor_brief}" "${compact_harbor_brief}" "${spaced_harbor_base}" "${spaced_compact_harbor_brief}" "${spaced_harbor_brief}"; then
  harbor_delivered=1
fi

child_function_calls=0
for transcript in "${child_by_lane[@]}"; do
  calls="$(jq -s '[.[] | select(.type == "response_item" and .payload.type == "function_call")] | length' "${transcript}")"
  child_function_calls=$((child_function_calls + calls))
done

expected_orchard_transport=$'Message Type: FINAL_ANSWER\nTask name: /root\nSender: /root/orchard_lane\nPayload:\nResult Card: ORCHARD_READY brief-id=orchard-8f3c'
expected_harbor_transport=$'Message Type: FINAL_ANSWER\nTask name: /root\nSender: /root/harbor_lane\nPayload:\nResult Card: HARBOR_READY brief-id=harbor-2a7d'
card_evidence="$(jq -s --arg orchard "${expected_orchard_transport}" --arg harbor "${expected_harbor_transport}" '
  [.[] | select(
    .type == "response_item"
    and .payload.type == "agent_message"
    and .payload.recipient == "/root"
    and (.payload.author == "/root/orchard_lane" or .payload.author == "/root/harbor_lane"))
    | ([.payload.content[]? | select(.type == "input_text") | .text] | join("\n"))
  ] as $messages
  | {
      total: ($messages | length),
      orchard: ([$messages[] | select(. == $orchard)] | length),
      harbor: ([$messages[] | select(. == $harbor)] | length)
    }
' "${parent_transcript}")"
worker_messages="$(jq -r '.total' <<<"${card_evidence}")"
orchard_cards="$(jq -r '.orchard' <<<"${card_evidence}")"
harbor_cards="$(jq -r '.harbor' <<<"${card_evidence}")"

if [[ -f "${ACCEPT_WORKSPACE}/verification.txt" ]]; then
  test "${direct_child_count}" -eq 2
  test "${child_structure_violations}" -eq 0
  test "${wait_timed_out}" = "false"
  test "${orchard_delivered}" -eq 1
  test "${harbor_delivered}" -eq 1
  test "${descendant_count}" -eq 0
  test "${child_function_calls}" -eq 0
  test "${worker_messages}" -eq 2
  test "${orchard_cards}" -eq 1
  test "${harbor_cards}" -eq 1
  test ! -e "${ACCEPT_WORKSPACE}/rejection.txt"
  test "$(git -C "${ACCEPT_WORKSPACE}" status --porcelain --untracked-files=all)" = "?? verification.txt"
  test "$(cat "${ACCEPT_WORKSPACE}/verification.txt")" = $'parent verified bounded workers\nORCHARD_READY\nHARBOR_READY'
  echo "OK host directly delivered both bounded briefs before worker action"
else
  [[ "${direct_child_count}" -ne 2 \
    || "${child_structure_violations}" -gt 0 \
    || "${wait_timed_out}" = "true" \
    || "${orchard_delivered}" -eq 0 \
    || "${harbor_delivered}" -eq 0 \
    || "${descendant_count}" -gt 0 \
    || "${child_function_calls}" -gt 0 \
    || "${worker_messages}" -ne 2 \
    || "${orchard_cards}" -ne 1 \
    || "${harbor_cards}" -ne 1 ]]
  require_file_exists "${ACCEPT_WORKSPACE}/rejection.txt"
  test "$(cat "${ACCEPT_WORKSPACE}/rejection.txt")" = "parent rejected unverified workers"
  jq -se -f "${ACCEPT_REPO}/plugins/sdd-workflow/acceptance/lib/codex-parent-lane.jq" "${parent_transcript}" >/dev/null
  lane_side_effects=0
  mapfile -t changed_paths < <(git -C "${ACCEPT_WORKSPACE}" status --porcelain --untracked-files=all)
  for entry in "${changed_paths[@]}"; do
    path="${entry:3}"
    case "${path}" in
      rejection.txt) ;;
      lanes/orchard/*|lanes/harbor/*) lane_side_effects=$((lane_side_effects + 1)) ;;
      *) exit 1 ;;
    esac
  done
  printf '%s\n' "${changed_paths[@]}" | grep -Fxq "?? rejection.txt"
  [[ "${lane_side_effects}" -eq 0 || "${child_function_calls}" -gt 0 ]]
  echo "OK parent failed closed; Git-visible workspace residue was confined to synthetic lane paths (filesystem-wide effects not claimed)"
fi
