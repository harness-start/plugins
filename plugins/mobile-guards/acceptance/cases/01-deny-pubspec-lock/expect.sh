#!/usr/bin/env bash
set -euo pipefail
test ! -e pubspec.lock
grep -Eqi 'lockfile|lock file|blocked|denied|拦截' "${ACCEPTANCE_TRANSCRIPT:?}"
