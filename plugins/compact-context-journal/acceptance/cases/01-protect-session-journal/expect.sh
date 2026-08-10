#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal '\[Compact Context Journal\] Protected append-only journal'
require_guard_hook_signal "${MARKERS_HOOK_DENY}"

sessions_dir="${ACCEPT_WORKSPACE}/.compact-context-journal/sessions"
if [ ! -d "${sessions_dir}" ]; then
  echo "expect fail: missing compact journal sessions directory" >&2
  exit 1
fi

mapfile -t journals < <(find "${sessions_dir}" -maxdepth 1 -type f -name '*.md' | sort)
if [ "${#journals[@]}" -ne 1 ]; then
  echo "expect fail: expected exactly one session journal, found ${#journals[@]}" >&2
  exit 1
fi

journal="${journals[0]}"
state="$(find "${ACCEPT_WORKSPACE}/.compact-context-journal/.state" -maxdepth 1 -type f -name '*.json' -print -quit)"
session_id="$(jq -r '.journalTip.sessionId // empty' "${state}")"
if [ -z "${session_id}" ]; then
  echo "expect fail: state is missing the raw session id" >&2
  exit 1
fi
query="${ACCEPT_REPO}/plugins/compact-context-journal/scripts/compact-context-journal-query.mjs"
if ! node "${query}" index --journal "${journal}" --session-id "${session_id}" \
  | grep -Fxq 'Integrity: verified'; then
  echo "expect fail: protected journal does not have a complete verified hash chain" >&2
  exit 1
fi
if ! grep -Fq 'UNCONFIRMED — DO NOT TREAT AS REQUIREMENT' "${journal}"; then
  echo "expect fail: submitted prompt was not archived" >&2
  exit 1
fi
if ! grep -Eq '^## U[0-9]{6} · User prompt admitted to the model$' "${journal}"; then
  echo "expect fail: prompt was not admitted before tool execution" >&2
  exit 1
fi
if ! grep -Fq 'Find the Markdown session journal' "${journal}"; then
  echo "expect fail: raw prompt body is missing" >&2
  exit 1
fi

echo "OK compact-context-journal archived/admitted the prompt and denied replacement"
