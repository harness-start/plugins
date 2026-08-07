#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal "${MARKERS_MARKDOWN_FORMAT}"

target="${ACCEPT_WORKSPACE}/docs/guide.md"
require_file_exists "${target}"

policy="${ACCEPT_REPO}/plugins/markdown-format-guard/scripts/lib/markdown-policy.mjs"
node --input-type=module -e '
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const mod = await import(pathToFileURL(process.argv[1]).href);
const text = readFileSync(process.argv[2], "utf8");
const result = mod.analyzeMarkdown(text, "docs/guide.md", mod.resolveConfig(null));
if (result.block.length > 0) {
  console.error(JSON.stringify(result.block, null, 2));
  process.exit(1);
}
if (!text.includes("Guide") || !text.includes("Setup") || !text.includes("Details")) {
  process.exit(1);
}
if (/^#{4}\s/m.test(text)) process.exit(1);
' "${policy}" "${target}"

echo "OK Markdown Format Guard signal present and repaired guide.md passes policy"
