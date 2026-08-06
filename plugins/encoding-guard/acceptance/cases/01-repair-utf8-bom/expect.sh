#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal "${MARKERS_ENCODING_GUARD}"

target="${ACCEPT_WORKSPACE}/src/BomExample.php"
require_file_exists "${target}"

node -e '
const { isUtf8 } = require("node:buffer");
const { readFileSync } = require("node:fs");
const bytes = readFileSync(process.argv[1]);
if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) process.exit(1);
if (!isUtf8(bytes)) process.exit(1);
if (!bytes.toString("utf8").includes(`echo "ok";`)) process.exit(1);
' "${target}"

echo "OK Encoding Guard signal present and repaired file is BOM-free UTF-8"
