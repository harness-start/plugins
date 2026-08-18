#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_session_context_signal 'engineering-review.*severity.*file:line'

expected='export function canEdit(user, resource) {
  return user.role === "admin" || resource.ownerId !== user.id;
}'
actual="$(cat "${ACCEPT_WORKSPACE}/src/permissions.mjs")"
if [ "${actual}" != "${expected}" ]; then
  echo "expect fail: read-only review modified permissions.mjs" >&2
  exit 1
fi

if ! grep -Eq 'P[0-3].*permissions\.mjs:2|permissions\.mjs:2.*P[0-3]' "${ACCEPT_LOG}"; then
  echo "expect fail: review did not return a severity-ranked exact anchor" >&2
  exit 1
fi

echo "OK read-only review found the ownership predicate defect with a ranked exact anchor"
