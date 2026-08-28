#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
packet="${ACCEPT_WORKSPACE}/review-packet.txt"
require_file_exists "${packet}"
for field in 'Objective:' 'Non-goals:' 'Allowed files:' 'Base:' 'Head:' 'Verification evidence:' 'Forbidden context:'; do
  grep -Fq "${field}" "${packet}"
done
grep -Fq 'src/delivery-state.mjs' "${packet}"
grep -Fq 'tests/delivery-state.test.mjs' "${packet}"
grep -Fq 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' "${packet}"
grep -Fq 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' "${packet}"
if grep -Eiq '(conversation history|full transcript|chain of thought|token-by-token)' "${packet}"; then
  grep -Eiq '^Forbidden context:.*(conversation|transcript|chain of thought|token-by-token)' "${packet}"
fi
echo "OK reviewer handoff stayed scoped and excluded conversation context"
