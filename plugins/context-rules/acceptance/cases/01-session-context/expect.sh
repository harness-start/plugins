#!/usr/bin/env bash
set -euo pipefail
if [ "${ACCEPT_HOST:?}" = "codex" ]; then
  telemetry="${ACCEPT_OUT:?}/codex-home/plugins/data/context-rules-harness-start/context-rules-inline/telemetry.jsonl"
else
  telemetry="${ACCEPT_OUT:?}/home/.plugin-data/context-rules-inline/telemetry.jsonl"
fi
test -s "${telemetry}"
grep -Eq '"kind":"context_injection".*"hook":"session"' "${telemetry}"
grep -Eqi 'AGENTS\.md|instruction file present' "${ACCEPT_LOG:?}"
