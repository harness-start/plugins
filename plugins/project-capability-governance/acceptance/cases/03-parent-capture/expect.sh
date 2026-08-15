#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
proposal="${ACCEPT_WORKSPACE}/.project-capabilities/inbox/pending/pc-repeatable-release-check.md"
require_file_exists "${proposal}"

node --input-type=module - "${ACCEPT_PLUGIN_DIR}/dist/cli/project-capability-manage.mjs" "${proposal}" <<'NODE'
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

echo "OK parent created and announced one schema-valid proposal without a plugin-owned child lifecycle"
