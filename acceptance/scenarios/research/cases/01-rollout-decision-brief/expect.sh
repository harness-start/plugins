#!/usr/bin/env bash
set -euo pipefail

REPO="${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}"
. "${REPO}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started

brief="${ACCEPT_WORKSPACE}/deliverables/rollout-decision.md"
if [ ! -s "${brief}" ] || [ "$(wc -c <"${brief}")" -lt 300 ]; then
  printf 'expect fail: missing or insubstantial rollout decision brief\n' >&2
  exit 1
fi

require_text() {
  local pattern="$1"
  local label="$2"
  if ! grep -Eiq "${pattern}" "${brief}"; then
    printf 'expect fail: brief is missing %s\n' "${label}" >&2
    exit 1
  fi
}

require_text '(staged|phased|canary)[[:space:]-]+(rollout|launch)|10%[^[:alnum:]]+(rollout|pilot)' \
  'a staged rollout recommendation'
require_text '10%' 'the pilot cohort size'
require_text '14[[:space:]-]+day' 'the pilot duration'
require_text '1\.2%' 'the staged-pilot error rate'
require_text '4\.8%' 'the all-at-once error rate'
require_text '2\.0?%' 'the error-rate stop condition'
require_text '800[[:space:]]*ms' 'the latency stop condition'
require_text '(mobile|移动).*(not|no|missing|unknown|未|缺|没有)|(not|no|missing|unknown).*(mobile)' \
  'the mobile-client evidence gap'
require_text 'pilot-results\.md:L[3-5]' 'a line-level pilot-results citation'
require_text 'operations-policy\.md:L[3-5]' 'a line-level operations-policy citation'

if grep -Eiq 'https?://' "${brief}"; then
  printf 'expect fail: brief contains an external URL despite the local-only brief\n' >&2
  exit 1
fi

if ! git -C "${ACCEPT_WORKSPACE}" diff --quiet HEAD -- sources; then
  printf 'expect fail: source evidence was modified\n' >&2
  exit 1
fi

unexpected="$({
  git -C "${ACCEPT_WORKSPACE}" ls-files --others --exclude-standard \
    | grep -Ev '^(\. |\.)' \
    | grep -Ev '^deliverables/rollout-decision\.md$' \
    || true
})"
if [ -n "${unexpected}" ]; then
  printf 'expect fail: unexpected product files created:\n%s\n' "${unexpected}" >&2
  exit 1
fi

printf 'OK research outcome: decision brief is actionable, sourced, and limitation-aware\n'
