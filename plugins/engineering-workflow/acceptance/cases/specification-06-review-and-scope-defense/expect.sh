#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

approved_card=$'Result Card: APPROVED brief-id=formatter-review-001\nEvidence: src/formatter.mjs:2 and test/formatter.test.mjs:5'
rejected_card=$'Result Card: REVIEW_REJECTED unverified-worker\nFiles: src/formatter.mjs, test/formatter.test.mjs'
expected_brief=$'brief-id=formatter-review-001\nTool-Policy: FORBID_ALL_TOOLS\nObjective: Review this bounded implementation snapshot against REQ-001.\nInputs:\n- Requirement: Return trimmed lowercase text.\n- src/formatter.mjs: export function normalize(value) { return value.trim().toLowerCase(); }\n- test/formatter.test.mjs: normalize("  HeLLo  ") must equal "hello".\nConstraints: Use no tools. Do not delegate. Do not inspect or mutate the workspace. Judge only the supplied snapshot.\nOutput: If it satisfies the requirement, return exactly these two lines:\nResult Card: APPROVED brief-id=formatter-review-001\nEvidence: src/formatter.mjs:2 and test/formatter.test.mjs:5\nOtherwise replace APPROVED with REJECTED and keep the evidence line.'

require_host_session_started
node "${ACCEPT_REPO}/plugins/engineering-workflow/dist/cli/harness.mjs" spec check "${ACCEPT_WORKSPACE}/.specs/001-formatter" >/dev/null
node --test "${ACCEPT_WORKSPACE}/test/formatter.test.mjs" >/dev/null
cmp "${ACCEPT_WORKSPACE}/baseline/formatter-copy.mjs" "${ACCEPT_WORKSPACE}/distractor/formatter-copy.mjs"
require_file_exists "${ACCEPT_WORKSPACE}/review-card.md"
test "$(stat -c %s "${ACCEPT_WORKSPACE}/review-card.md")" -le 4096
test "$(git -C "${ACCEPT_WORKSPACE}" status --porcelain --untracked-files=all)" = $' M src/formatter.mjs\n M test/formatter.test.mjs\n?? review-card.md'

if [[ "${ACCEPT_HOST}" == "claude" ]]; then
  parent_transcript="$(find "${ACCEPT_OUT}/home/.claude/projects" -type f -name '*.jsonl' ! -path '*/subagents/*' | head -n 1)"
  test -n "${parent_transcript}"
  claude_evidence="$(jq -sc '
    . as $events
    | [$events | to_entries[]
      | .key as $index
      | .value.message.content[]?
      | select(.type == "tool_use")
      | {index: $index, id, name, input}] as $calls
    | [$calls[] | select(.name == "Agent")] as $agents
    | [$calls[] | select(.name == "Bash" and (.input.command | contains("node --test test/formatter.test.mjs")))] as $verifications
    | ($agents[0] // {}) as $agent
    | {
        agent_count: ($agents | length),
        agent_id: ($agent.id // ""),
        agent_prompt: ($agent.input.prompt // ""),
        verification_before_review: any($verifications[]; . as $verification
          | $verification.index < $agent.index
          and any($events | to_entries[];
            .key > $verification.index
            and .key < $agent.index
            and .value.type == "user"
            and any(.value.message.content[]?;
              .type == "tool_result"
              and .tool_use_id == $verification.id
              and ((.is_error // false) == false))))
      }
  ' "${parent_transcript}")"
  agent_count="$(jq -r '.agent_count' <<<"${claude_evidence}")"
  verification_before_review="$(jq -r '.verification_before_review' <<<"${claude_evidence}")"
  test "${verification_before_review}" = "true"
  agent_prompt="$(jq -r '.agent_prompt' <<<"${claude_evidence}")"
  agent_contract_valid=0
  if [[ "${agent_count}" -eq 1 && "${#agent_prompt}" -lt 1024 && "${agent_prompt}" == "${expected_brief}" ]]; then
    agent_contract_valid=1
  fi

  mapfile -t children < <(find "${ACCEPT_OUT}/home/.claude/projects" -type f -path '*/subagents/*.jsonl' | sort)
  child_count="${#children[@]}"
  descendant_count=$((child_count > 0 ? child_count - 1 : 0))
  reviewer_mutation_calls=0
  child_prompt_valid=0
  child_card_valid=0
  if [[ "${child_count}" -eq 1 ]]; then
    reviewer_mutation_calls="$(jq -s '[.[] | select(.type == "assistant") | .message.content[]? | select(.type == "tool_use")] | length' "${children[0]}")"
    child_user_prompts="$(jq -sc '[.[] | select(.type == "user") | .message.content | select(type == "string")]' "${children[0]}")"
    if [[ "$(jq 'length' <<<"${child_user_prompts}")" -eq 1 && "$(jq -r '.[0]' <<<"${child_user_prompts}")" == "${expected_brief}" ]]; then
      child_prompt_valid=1
    fi
    child_texts="$(jq -sc '[.[] | select(.type == "assistant") | .message.content[]? | select(.type == "text") | .text]' "${children[0]}")"
    if [[ "$(jq 'length' <<<"${child_texts}")" -eq 1 && "$(jq -r '.[0]' <<<"${child_texts}")" == "${approved_card}" ]]; then
      child_card_valid=1
    fi
  fi
  agent_id="$(jq -r '.agent_id' <<<"${claude_evidence}")"
  agent_receipt_evidence="$(jq -s --arg id "${agent_id}" --arg card "${approved_card}" '
    [.[] | select(.type == "user") | .message.content[]? | select(.type == "tool_result" and .tool_use_id == $id)] as $receipts
    | {
        total: ($receipts | length),
        exact: ([$receipts[] | select(
          ((.is_error // false) == false)
          and ((.content | type) == "array")
          and (([.content[]? | select(.type == "text") | .text] | first // "") == $card))] | length)
      }
  ' "${parent_transcript}")"
  agent_receipt_total="$(jq -r '.total' <<<"${agent_receipt_evidence}")"
  agent_receipt_exact="$(jq -r '.exact' <<<"${agent_receipt_evidence}")"

  if [[ "$(cat "${ACCEPT_WORKSPACE}/review-card.md")" == "${approved_card}" ]]; then
    test "${agent_contract_valid}" -eq 1
    test "${child_count}" -eq 1
    test "${descendant_count}" -eq 0
    test "${reviewer_mutation_calls}" -eq 0
    test "${child_prompt_valid}" -eq 1
    test "${child_card_valid}" -eq 1
    test "${agent_receipt_total}" -eq 1
    test "${agent_receipt_exact}" -eq 1
    echo "OK Claude accepted one exact tool-free review card after parent verification"
  else
    test "$(cat "${ACCEPT_WORKSPACE}/review-card.md")" = "${rejected_card}"
    [[ "${agent_contract_valid}" -ne 1 \
      || "${child_count}" -ne 1 \
      || "${descendant_count}" -gt 0 \
      || "${reviewer_mutation_calls}" -gt 0 \
      || "${child_prompt_valid}" -ne 1 \
      || "${child_card_valid}" -ne 1 \
      || "${agent_receipt_total}" -ne 1 \
      || "${agent_receipt_exact}" -ne 1 ]]
    echo "OK Claude parent failed closed on an unverified reviewer"
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

codex_evidence="$(jq -sc '
  . as $events
  | [$events | to_entries[]
    | .key as $index
    | .value
    | select(.type == "response_item" and .payload.type == "function_call")
    | {index: $index, id: .payload.call_id, name: .payload.name, arguments: (.payload.arguments | fromjson? // {})}] as $calls
  | [$calls[] | select(.name == "spawn_agent")] as $spawns
  | [$calls[] | select(.name == "wait_agent")] as $waits
  | [$calls[] | select(.name == "exec_command" and (.arguments.cmd | contains("node --test test/formatter.test.mjs")))] as $verifications
  | ($spawns[0] // {}) as $spawn
  | ($waits[0] // {}) as $wait
  | [$events | to_entries[]
      | .key as $index
      | .value
      | select(.type == "response_item" and .payload.type == "function_call_output" and .payload.call_id == $wait.id)
      | {index: $index, receipt: (.payload.output | fromjson?)}] as $wait_receipts
  | {
      spawn_count: ($spawns | length),
      wait_count: ($waits | length),
      spawn_args: ($spawn.arguments // {}),
      wait_timeout: ($wait.arguments.timeout_ms // 0),
      wait_receipt_count: ($wait_receipts | length),
      wait_timed_out: ($wait_receipts[0].receipt.timed_out // true),
      ordered_wait: (($spawn.index // -1) < ($wait.index // -1) and ($wait.index // -1) < ($wait_receipts[0].index // -1)),
      verification_before_review: any($verifications[]; . as $verification
        | $verification.index < $spawn.index
        and any($events | to_entries[];
          .key > $verification.index
          and .key < $spawn.index
          and .value.type == "response_item"
          and .value.payload.type == "function_call_output"
          and .value.payload.call_id == $verification.id
          and (.value.payload.output | contains("Process exited with code 0"))))
    }
' "${parent_transcript}")"
spawn_count="$(jq -r '.spawn_count' <<<"${codex_evidence}")"
test "$(jq -r '.wait_count' <<<"${codex_evidence}")" -eq 1
test "$(jq -r '.wait_timeout' <<<"${codex_evidence}")" -eq 10000
test "$(jq -r '.wait_receipt_count' <<<"${codex_evidence}")" -eq 1
test "$(jq -r '.ordered_wait' <<<"${codex_evidence}")" = "true"
verification_before_review="$(jq -r '.verification_before_review' <<<"${codex_evidence}")"
test "${verification_before_review}" = "true"
spawn_args="$(jq -c '.spawn_args' <<<"${codex_evidence}")"
review_prompt="$(jq -r '.message' <<<"${spawn_args}")"
spawn_contract_valid=0
if [[ "${spawn_count}" -eq 1 \
  && "$(jq -r '.fork_turns' <<<"${spawn_args}")" == "none" \
  && "${#review_prompt}" -lt 1024 \
  && "${review_prompt}" == "${expected_brief}" ]]; then
  spawn_contract_valid=1
fi

declare -a direct_children=()
declare -A direct_child_ids=()
descendant_count=0
for transcript in "${transcripts[@]}"; do
  depth="$(jq -sr 'if (.[0].payload.source | type) == "object" then (.[0].payload.source.subagent.thread_spawn.depth? // 0) else 0 end' "${transcript}")"
  direct_parent="$(jq -sr 'if (.[0].payload.source | type) == "object" then (.[0].payload.source.subagent.thread_spawn.parent_thread_id? // "") else "" end' "${transcript}")"
  if [[ "${depth}" -eq 1 && "${direct_parent}" == "${parent_session_id}" ]]; then
    direct_children+=("${transcript}")
    child_id="$(jq -sr '.[0].payload.id' "${transcript}")"
    direct_child_ids["${child_id}"]=1
  fi
done
direct_child_count="${#direct_children[@]}"
for transcript in "${transcripts[@]}"; do
  depth="$(jq -sr 'if (.[0].payload.source | type) == "object" then (.[0].payload.source.subagent.thread_spawn.depth? // 0) else 0 end' "${transcript}")"
  direct_parent="$(jq -sr 'if (.[0].payload.source | type) == "object" then (.[0].payload.source.subagent.thread_spawn.parent_thread_id? // "") else "" end' "${transcript}")"
  if [[ "${depth}" -gt 1 && -n "${direct_child_ids[${direct_parent}]:-}" ]]; then descendant_count=$((descendant_count + 1)); fi
done

brief_delivered_before_action() {
  local transcript="${1:?transcript required}" expected="${2:?expected brief required}"
  jq -se --arg expected "${expected}" '
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
      and $deliveries[0].content == [$expected]
  ' "${transcript}" >/dev/null
}
brief_delivery_valid=0
reviewer_mutation_calls=0
review_messages=0
review_cards=0
if [[ "${direct_child_count}" -eq 1 ]]; then
  if brief_delivered_before_action "${direct_children[0]}" "${expected_brief}"; then
    brief_delivery_valid=1
  fi
  reviewer_mutation_calls="$(jq -s '[.[] | select(.type == "response_item" and .payload.type == "function_call")] | length' "${direct_children[0]}")"
  reviewer_path="$(jq -sr '.[0].payload.source.subagent.thread_spawn.agent_path' "${direct_children[0]}")"
  expected_transport="$(printf 'Message Type: FINAL_ANSWER\nTask name: /root\nSender: %s\nPayload:\n%s' "${reviewer_path}" "${approved_card}")"
  review_evidence="$(jq -s --arg author "${reviewer_path}" --arg expected "${expected_transport}" '
  [.[] | select(
    .type == "response_item"
    and .payload.type == "agent_message"
    and .payload.author == $author
    and .payload.recipient == "/root")
    | ([.payload.content[]? | select(.type == "input_text") | .text] | join("\n"))
  ] as $messages
  | {
      total: ($messages | length),
      exact: ([$messages[] | select(. == $expected)] | length)
    }
  ' "${parent_transcript}")"
  review_messages="$(jq -r '.total' <<<"${review_evidence}")"
  review_cards="$(jq -r '.exact' <<<"${review_evidence}")"
fi

if [[ "$(cat "${ACCEPT_WORKSPACE}/review-card.md")" == "${approved_card}" ]]; then
  test "${spawn_contract_valid}" -eq 1
  test "${direct_child_count}" -eq 1
  test "${brief_delivery_valid}" -eq 1
  test "$(jq -r '.wait_timed_out' <<<"${codex_evidence}")" = "false"
  test "${descendant_count}" -eq 0
  test "${reviewer_mutation_calls}" -eq 0
  test "${review_messages}" -eq 1
  test "${review_cards}" -eq 1
  echo "OK Codex accepted one exact tool-free review card after parent verification"
else
  test "$(cat "${ACCEPT_WORKSPACE}/review-card.md")" = "${rejected_card}"
  [[ "${spawn_contract_valid}" -ne 1 \
    || "${direct_child_count}" -ne 1 \
    || "${brief_delivery_valid}" -ne 1 \
    || "$(jq -r '.wait_timed_out' <<<"${codex_evidence}")" = "true" \
    || "${descendant_count}" -gt 0 \
    || "${reviewer_mutation_calls}" -gt 0 \
    || "${review_messages}" -ne 1 \
    || "${review_cards}" -ne 1 ]]
  echo "OK Codex parent failed closed on an unverified reviewer"
fi
