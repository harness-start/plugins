#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal "${MARKERS_MARKDOWN_FORMAT}"

target="${ACCEPT_WORKSPACE}/docs/guide.md"
require_file_exists "${target}"
node -e '
const { readFileSync } = require("node:fs");
const text = readFileSync(process.argv[1], "utf8");
let previous = 0;
for (const line of text.split(/\r?\n/)) {
  const match = /^(#{1,6})\s+/.exec(line);
  if (!match) continue;
  const level = match[1].length;
  if (previous > 0 && level > previous + 1) process.exit(1);
  previous = level;
}
if (!text.includes("Guide") || !text.includes("Setup") || !text.includes("Details")) process.exit(1);
if (/^#{4}\s/m.test(text)) process.exit(1);
' "${target}"

echo "OK Engineering Quality Markdown signal present and repaired guide.md passes policy"
