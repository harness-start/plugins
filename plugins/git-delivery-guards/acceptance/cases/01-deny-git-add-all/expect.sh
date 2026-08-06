#!/usr/bin/env bash
set -euo pipefail
grep -Eqi 'git add|bulk|staging|暂存|拦截|denied' "${ACCEPTANCE_TRANSCRIPT:?}"
