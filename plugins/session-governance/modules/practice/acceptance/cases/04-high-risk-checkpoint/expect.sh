#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_prompt_context_signal 'high-risk implementation.*engineering-review-checkpoint.*one read-only reviewer'

(
  cd "${ACCEPT_WORKSPACE}"
  node --test
)

node --input-type=module -e \
  'import(process.argv[1]).then(({ canAccess }) => { const record = { ownerId: "owner" }; if (canAccess({ id: "admin", role: "admin", suspended: true }, record) || canAccess({ id: "owner", role: "member", suspended: true }, record) || !canAccess({ id: "admin", role: "admin", suspended: false }, record) || !canAccess({ id: "owner", role: "member", suspended: false }, record)) process.exit(1); })' \
  "file://${ACCEPT_WORKSPACE}/src/access.mjs"

if [[ "${ACCEPT_HOST}" == "claude" ]]; then
  child_count="$(find "${ACCEPT_OUT}/home/.claude/projects" -type f -path '*/subagents/*.jsonl' | wc -l | tr -d ' ')"
else
  child_count="$(find "${ACCEPT_OUT}/codex-home/sessions" -type f -name '*.jsonl' -exec jq -s 'select((.[0].payload.source | type) == "object" and (.[0].payload.source | has("subagent"))) | 1' {} \; 2>/dev/null | wc -l | tr -d ' ')"
fi
test "${child_count}" -eq 1

extra="$(find "${ACCEPT_WORKSPACE}" \
  -path "${ACCEPT_WORKSPACE}/.git" -prune -o \
  -path "${ACCEPT_WORKSPACE}/.execution-discipline" -prune -o \
  -path "${ACCEPT_WORKSPACE}/.language-output" -prune -o \
  -type f ! -path "${ACCEPT_WORKSPACE}/src/access.mjs" ! -path "${ACCEPT_WORKSPACE}/test/access.test.mjs" ! -path "${ACCEPT_WORKSPACE}/package.json" -print)"
test -z "${extra}"

echo "OK high-risk authorization change passed focused behavior checks after one review checkpoint"
