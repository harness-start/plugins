#!/usr/bin/env bash
set -euo pipefail
test ! -e src/service.js.bak
grep -Eqi 'backup|artifact|备份|拦截|denied' "${ACCEPTANCE_TRANSCRIPT:?}"
