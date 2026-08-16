#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'agent-authored natural-language values'
target="${ACCEPT_WORKSPACE}/report.json"
require_file_exists "${target}"

node - "${target}" <<'NODE'
const { readFileSync } = require("node:fs");

const report = JSON.parse(readFileSync(process.argv[2], "utf8"));
const expectedKeys = ["evidence", "nextAction", "summary"];
const actualKeys = Object.keys(report).sort();
if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
  throw new Error(`unexpected keys: ${actualKeys.join(",")}`);
}
if (!Array.isArray(report.evidence) || report.evidence.length === 0) {
  throw new Error("evidence must be a non-empty array");
}
const values = [report.summary, ...report.evidence, report.nextAction];
for (const value of values) {
  if (typeof value !== "string" || !/\p{Script=Han}/u.test(value)) {
    throw new Error(`structured prose does not follow zh-CN: ${JSON.stringify(value)}`);
  }
  if (/release validation result|observed evidence|recommended next action/iu.test(value)) {
    throw new Error(`English placeholder was copied: ${JSON.stringify(value)}`);
  }
}
NODE

echo "OK zh-CN profile localized structured values and preserved JSON keys"
