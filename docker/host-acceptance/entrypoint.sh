#!/usr/bin/env bash
# Container entry: marketplace is mounted at /marketplace (read-only OK for sources).
# Live Claude/Codex acceptance is container-only; mark so run.sh does not re-wrap Docker.
set -euo pipefail

export ACCEPT_IN_CONTAINER=1

if [ -d /marketplace/scripts/acceptance ]; then
  # Writable out dir
  export ACCEPT_OUT_DIR="${ACCEPT_OUT_DIR:-/out}"
  mkdir -p "${ACCEPT_OUT_DIR}"
  # Prefer running scripts from the mounted tree (bash scripts need no write)
  exec bash /marketplace/scripts/acceptance/run.sh "$@"
fi

printf 'Marketplace not mounted at /marketplace\n' >&2
exit 2
