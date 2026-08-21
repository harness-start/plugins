#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
html="${ACCEPT_WORKSPACE}/index.html"
css="${ACCEPT_WORKSPACE}/styles.css"
js="${ACCEPT_WORKSPACE}/app.js"
require_file_exists "${html}"
require_file_exists "${css}"
require_file_exists "${js}"

grep -Fq 'aria-expanded' "${html}"
grep -Eq -- '--((motion-)?duration|dur)-[a-zA-Z0-9-]+:' "${css}"
grep -Eq -- '--(motion-)?ease-[a-zA-Z0-9-]+:' "${css}"
grep -Fq 'prefers-reduced-motion' "${css}"
grep -Eq 'transition:[^;]*(grid-template-rows|opacity|transform)|^[[:space:]]*(grid-template-rows|opacity|transform)[[:space:]]+var\(--motion-' "${css}"
if grep -Eq '(^|[\{;])[[:space:]]*transition(-property)?[[:space:]]*:[[:space:]]*all([[:space:];,!]|$)|\btransition-all\b' "${css}"; then
  echo "expect fail: motion must enumerate properties" >&2
  exit 1
fi
if grep -Eq '(^|[^[:alnum:]_$])((window|globalThis)\.)?set(Timeout|Interval)[[:space:]]*\(' "${js}"; then
  echo "expect fail: disclosure must not depend on stale timer cleanup" >&2
  exit 1
fi
grep -Eq 'aria-expanded.*true|setAttribute\([^,]+aria-expanded|toggleAttribute' "${js}"

if [ "${ACCEPT_IN_CONTAINER:-0}" != "1" ]; then
  echo "expect fail: disclosure behavior acceptance must run inside the acceptance container" >&2
  exit 1
fi

behavior="${ACCEPT_OUT}/disclosure-behavior.json"
node "${ACCEPT_REPO}/plugins/interface-craft/acceptance/check-layout.mjs" "file://${html}" disclosure >"${behavior}"
jq -e '
  .normal.latestOpen
  and .normal.panelVisible
  and .normal.focusRetained
  and (.normal.transitionAll | not)
  and (.normal.maxMotionSeconds > 0)
  and .reduced.latestOpen
  and .reduced.panelVisible
  and .reduced.focusRetained
  and (.reduced.transitionAll | not)
  and (.reduced.maxMotionSeconds <= 0.05)
' "${behavior}" >/dev/null

echo "OK disclosure has semantic tokens, bounded properties, latest-state behavior, and reduced motion"
