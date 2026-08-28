#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_file_exists "${ACCEPT_WORKSPACE}/index.html"
require_file_exists "${ACCEPT_WORKSPACE}/styles.css"

css="${ACCEPT_WORKSPACE}/styles.css"
grep -Eq -- '--[a-zA-Z0-9-]+:' "${css}"
grep -Fq ':focus-visible' "${css}"
grep -Fq 'prefers-reduced-motion' "${css}"
awk '
  /transition(-property|-duration|-timing-function)?[[:space:]]*:/ { in_transition = 1 }
  in_transition && /var\(--/ { found = 1 }
  in_transition && /;/ { in_transition = 0 }
  END { exit found ? 0 : 1 }
' "${css}"
if grep -Eq '(^|[\{;])[[:space:]]*transition(-property)?[[:space:]]*:[[:space:]]*all([[:space:];,!]|$)|\btransition-all\b' "${css}"; then
  echo "expect fail: transition-all is forbidden" >&2
  exit 1
fi

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

layout="${ACCEPT_OUT}/interface-layout.json"
node "${ACCEPT_REPO}/plugins/interface-design/modules/craft/acceptance/check-layout.mjs" "${page}" >"${layout}"
jq -e '
  .desktop.scrollWidth <= (.desktop.innerWidth + 1)
  and .mobile.scrollWidth <= (.mobile.innerWidth + 1)
  and .desktop.primaryVisible
  and .mobile.primaryVisible
  and .desktop.focusVisible
  and .mobile.focusVisible
  and (.desktop.transitionAll | not)
  and (.mobile.transitionAll | not)
  and (.mobile.maxMotionSeconds > 0)
  and (.reduced.maxMotionSeconds <= 0.05)
  and ([.mobile.cards[].top | floor] | unique | length >= 2)
  and ([.mobile.cards[] | select(.left < 0 or .right > 391)] | length == 0)
' "${layout}" >/dev/null

echo "OK responsive interface rendered with overflow, reflow, focus, and reduced-motion checks"
