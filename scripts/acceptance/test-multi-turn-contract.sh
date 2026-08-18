#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
runner="${repo_root}/scripts/acceptance/lib/run-case.sh"
common="${repo_root}/scripts/acceptance/lib/common.sh"

grep -Fq 'prompt-2.md' "${runner}"
grep -Fq 'run_claude_continuation' "${runner}"
grep -Fq 'run_codex_continuation' "${runner}"
grep -Fq -- '--continue' "${common}"
grep -Fq 'exec resume' "${common}"

echo "OK plugin acceptance runner supports an optional second turn"
