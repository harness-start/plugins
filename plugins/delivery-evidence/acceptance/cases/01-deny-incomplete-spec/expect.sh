#!/usr/bin/env bash
set -euo pipefail
test ! -e .specs/login/plan.md
grep -Eqi 'spec|clarification|澄清|阻断|denied' "${ACCEPTANCE_TRANSCRIPT:?}"
