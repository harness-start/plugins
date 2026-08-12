#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
proposal="${ACCEPT_WORKSPACE}/.project-capabilities/inbox/pending/pc-repeatable-release-check.md"
require_file_exists "${proposal}"

node --input-type=module - "${ACCEPT_PLUGIN_DIR}/scripts/lib/proposals.mjs" "${proposal}" <<'NODE'
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
const [{ validateProposalDocument }, content] = await Promise.all([
  import(process.argv[2]),
  readFile(process.argv[3], "utf8"),
]);
const checked = validateProposalDocument(content, basename(process.argv[3]));
if (!checked.ok) throw new Error(checked.reason);
if (checked.proposal.id !== "pc-repeatable-release-check") throw new Error("wrong proposal id");
NODE

notice_state="${ACCEPT_WORKSPACE}/.project-capabilities/.notice-state.json"
require_file_exists "${notice_state}"
jq -e '.notified["pc-repeatable-release-check"] == 1' "${notice_state}" >/dev/null

if [ "${ACCEPT_HOST}" = "claude" ]; then
  require_guard_hook_signal 'Hook SubagentStart.*success:|Hook SubagentStart'
  mapfile -t transcripts < <(find "${ACCEPT_OUT}/home/.claude/projects" -type f -name '*.jsonl' | sort)
  if [ "${#transcripts[@]}" -eq 0 ] || ! jq -s -e 'any(.[].message.content[]?;
    .type == "tool_use"
    and .name == "Agent"
    and ((.input.prompt // "") | startswith("PROJECT_CAPABILITY_RECORDER acceptance-capture"))
  )' "${transcripts[@]}" >/dev/null; then
    echo "expect fail: Claude transcript has no recorder Agent dispatch with the required marker" >&2
    exit 1
  fi
else
  mapfile -t traces < <(find "${ACCEPT_OUT}/codex-home/sessions" -type f -name '*.jsonl' | sort)
  jq -s -e 'any(.[];
    .type == "session_meta"
    and .payload.thread_source == "subagent"
    and .payload.source.subagent.thread_spawn.depth == 1
  )' "${traces[@]}" >/dev/null
  dispatches="$(jq -s '[.[] | select(
    .type == "response_item"
    and .payload.type == "function_call"
    and .payload.namespace == "collaboration"
    and .payload.name == "spawn_agent"
    and (.payload.arguments | contains("PROJECT_CAPABILITY_RECORDER acceptance-capture"))
  )] | length' "${traces[@]}")"
  if [ "${dispatches}" -ne 1 ]; then
    echo "expect fail: expected one Codex recorder dispatch, observed ${dispatches}" >&2
    exit 1
  fi
fi

echo "OK one real recorder created and announced one valid proposal"
