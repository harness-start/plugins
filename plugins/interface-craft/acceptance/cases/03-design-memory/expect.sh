#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_file_exists "${ACCEPT_WORKSPACE}/DESIGN.md"
require_file_exists "${ACCEPT_WORKSPACE}/index.html"
require_file_exists "${ACCEPT_WORKSPACE}/styles.css"

design="${ACCEPT_WORKSPACE}/DESIGN.md"
test "$(head -c 135 "${design}" | sha256sum | cut -d' ' -f1)" = "7fa6d2d2f9e3de031ecacac120830d50996d20fc88804fb623672abf176893e7"
grep -Fq 'Project-authored context: Acme serves independent retailers.' "${design}"
test "$(grep -Fc '<!-- interface-craft:system:start -->' "${design}")" -eq 1
test "$(grep -Fc '<!-- interface-craft:system:end -->' "${design}")" -eq 1
grep -Fq '### Evidence' "${design}"
grep -Fq '#### Facts' "${design}"
grep -Fq '#### Inferences' "${design}"
grep -Fq '#### Assumptions' "${design}"
grep -Fq '### Semantic tokens' "${design}"
grep -Fq '### Component patterns and states' "${design}"
grep -Fq '### Responsive and motion contracts' "${design}"
grep -Fq 'verification status' "${design}"
grep -Eq -- '--(color|space|surface|type)-[a-zA-Z0-9-]+:' "${ACCEPT_WORKSPACE}/styles.css"

echo "OK material redesign produced one project-owned design-memory block"
