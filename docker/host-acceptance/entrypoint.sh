#!/usr/bin/env bash
# Container entry: marketplace is mounted at /marketplace (read-only OK for sources).
set -euo pipefail

if [ -d /marketplace/scripts/acceptance ]; then
  # Writable out dir
  export ACCEPT_OUT_DIR="${ACCEPT_OUT_DIR:-/out}"
  mkdir -p "${ACCEPT_OUT_DIR}"
  # Copy runner onto writable path when marketplace is read-only — run from mount if possible
  if [ -w /marketplace ]; then
    exec bash /marketplace/scripts/acceptance/run.sh "$@"
  fi
  # Read-only mount: materialize a writable workspace with rsync/cp of acceptance scripts only
  # Prefer running scripts from the mounted tree (bash scripts need no write)
  exec bash /marketplace/scripts/acceptance/run.sh "$@"
fi

printf 'Marketplace not mounted at /marketplace\n' >&2
exit 2
