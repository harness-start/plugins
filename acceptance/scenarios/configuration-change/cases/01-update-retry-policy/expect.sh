#!/usr/bin/env bash
set -euo pipefail

REPO="${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}"
. "${REPO}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started

config="${ACCEPT_WORKSPACE}/config/runtime.json"
jq -e '
  . == {
    retry: {
      maxAttempts: 5,
      baseDelayMs: 500,
      maxDelayMs: 4000,
      jitter: true
    },
    timeouts: {
      requestMs: 8000
    },
    features: {
      adaptiveBackoff: true,
      requestCoalescing: true
    }
  }
' "${config}" >/dev/null

npm --prefix "${ACCEPT_WORKSPACE}" test >/dev/null

changed="$(git -C "${ACCEPT_WORKSPACE}" diff --name-only HEAD --)"
if [ "${changed}" != "config/runtime.json" ]; then
  printf 'expect fail: tracked change must be exactly config/runtime.json, got: %s\n' \
    "${changed:-<none>}" >&2
  exit 1
fi

unexpected="$({
  git -C "${ACCEPT_WORKSPACE}" ls-files --others --exclude-standard \
    | grep -Ev '^\.' \
    || true
})"
if [ -n "${unexpected}" ]; then
  printf 'expect fail: unexpected product files created:\n%s\n' "${unexpected}" >&2
  exit 1
fi

printf 'OK configuration outcome: requested policy changed and all other settings preserved\n'
