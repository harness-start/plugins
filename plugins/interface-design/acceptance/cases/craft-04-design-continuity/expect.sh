#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
design="${ACCEPT_WORKSPACE}/DESIGN.md"
html="${ACCEPT_WORKSPACE}/index.html"
css="${ACCEPT_WORKSPACE}/styles.css"
require_file_exists "${design}"
require_file_exists "${html}"
require_file_exists "${css}"

test "$(head -c 89 "${design}" | sha256sum | cut -d' ' -f1)" = "34713cfe61356b68b031c94f1bf06a33e0c03182b556a878027238bcb69aecf6"
grep -Fq 'Project-authored note: settings are managed by account owners.' "${design}"
grep -Fq 'Fact F-001: The committed accent token is #d97706.' "${design}"
grep -Fq 'Primary controls use a 44px minimum height.' "${design}"
test "$(grep -Fc '<!-- interface-craft:system:start -->' "${design}")" -eq 1
test "$(grep -Fc '<!-- interface-craft:system:end -->' "${design}")" -eq 1
grep -Eiq 'settings|preferences' "${html}"
grep -Fq 'var(--color-accent)' "${css}"
grep -Eq 'min-height:[[:space:]]*44px|height:[[:space:]]*44px' "${css}"
test "$(grep -c -- '--color-accent:' "${css}")" -eq 1

echo "OK later surface reused project design memory without duplicating the system"
