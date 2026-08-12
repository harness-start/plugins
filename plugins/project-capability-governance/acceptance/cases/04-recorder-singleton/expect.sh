#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_file_exists "${ACCEPT_WORKSPACE}/.project-capabilities/inbox/pending/pc-primary-check.md"
require_file_absent "${ACCEPT_WORKSPACE}/.project-capabilities/inbox/pending/pc-secondary-check.md"

node --input-type=module - "${ACCEPT_PLUGIN_DIR}/scripts/lib/proposals.mjs" "${ACCEPT_WORKSPACE}/.project-capabilities/inbox/pending/pc-primary-check.md" <<'NODE'
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
const [{ validateProposalDocument }, content] = await Promise.all([
  import(process.argv[2]),
  readFile(process.argv[3], "utf8"),
]);
const checked = validateProposalDocument(content, basename(process.argv[3]));
if (!checked.ok) throw new Error(checked.reason);
if (checked.proposal.id !== "pc-primary-check") throw new Error("wrong proposal id");
NODE

if [ "${ACCEPT_HOST}" = "claude" ]; then
  require_guard_hook_signal 'only one recorder subagent is allowed|permissionDecision.*deny|PreToolUse Blocked'
else
  mapfile -t traces < <(find "${ACCEPT_OUT}/codex-home/sessions" -type f -name '*.jsonl' | sort)
  depth_one="$(jq -s '[.[] | select(.type == "session_meta" and .payload.thread_source == "subagent" and .payload.source.subagent.thread_spawn.depth == 1)] | length' "${traces[@]}")"
  if [ "${depth_one}" -ne 2 ]; then
    echo "expect fail: expected two depth-one Codex recorder attempts, observed ${depth_one}" >&2
    exit 1
  fi
  state="$(find "${ACCEPT_OUT}/codex-home/plugins/data/project-capability-governance-harness-start/sessions" -maxdepth 1 -type f -name '*.json' | head -1)"
  if [ -z "${state}" ]; then
    echo "expect fail: missing Codex recorder workflow state" >&2
    exit 1
  fi
  jq -e '(.bindings | length) == 1 and ([.bindings[].batchId] == ["acceptance-primary"])' "${state}" >/dev/null
fi

echo "OK only the first recorder in the prompt epoch could create a proposal"
