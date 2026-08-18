#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_file_exists "${ACCEPT_WORKSPACE}/index.html"
require_file_exists "${ACCEPT_WORKSPACE}/styles.css"

css="${ACCEPT_WORKSPACE}/styles.css"
grep -Eq -- '--[a-zA-Z0-9-]+:' "${css}"
grep -Eq '@media[^\{]*(max-width|width[[:space:]]*<)' "${css}"
grep -Fq ':focus-visible' "${css}"
grep -Fq 'prefers-reduced-motion' "${css}"

if [ "${ACCEPT_IN_CONTAINER:-0}" != "1" ]; then
  echo "expect fail: rendered interface acceptance must run inside the acceptance container" >&2
  exit 1
fi

desktop="${ACCEPT_OUT}/interface-desktop.png"
mobile="${ACCEPT_OUT}/interface-mobile.png"
page="file://${ACCEPT_WORKSPACE}/index.html"

chromium --headless --no-sandbox --disable-gpu --disable-dev-shm-usage --hide-scrollbars \
  --user-data-dir="${ACCEPT_OUT}/chromium-desktop" \
  --window-size=1440,900 --screenshot="${desktop}" "${page}" >/dev/null 2>&1
chromium --headless --no-sandbox --disable-gpu --disable-dev-shm-usage --hide-scrollbars \
  --user-data-dir="${ACCEPT_OUT}/chromium-mobile" \
  --window-size=390,844 --screenshot="${mobile}" "${page}" >/dev/null 2>&1

test "$(stat -c %s "${desktop}")" -gt 10000
test "$(stat -c %s "${mobile}")" -gt 10000
test "$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${desktop}")" = "1440x900"
test "$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${mobile}")" = "390x844"

echo "OK responsive interface rendered at desktop and mobile viewports"
