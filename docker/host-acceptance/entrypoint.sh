#!/usr/bin/env bash
# Container entry: marketplace is mounted at /marketplace (read-only OK for sources).
# Live Claude/Codex acceptance is container-only; mark so run.sh does not re-wrap Docker.
#
# Must not run as root: Claude blocks --dangerously-skip-permissions for euid 0.
set -euo pipefail

export ACCEPT_IN_CONTAINER=1

if [ "$(id -u)" -eq 0 ]; then
  printf 'error: acceptance container must not run as root (Claude denies --dangerously-skip-permissions)\n' >&2
  printf 'hint: run.sh should pass --user "$(id -u):$(id -g)"\n' >&2
  exit 2
fi

# Arbitrary host UIDs often lack a passwd entry; ensure a writable HOME.
if [ -z "${HOME:-}" ] || [ ! -d "${HOME}" ] || [ ! -w "${HOME}" ]; then
  export HOME="${ACCEPT_OUT_DIR:-/out}/.container-home"
fi
mkdir -p "${HOME}"

if [ -d /marketplace/scripts/acceptance ]; then
  export ACCEPT_OUT_DIR="${ACCEPT_OUT_DIR:-/out}"
  mkdir -p "${ACCEPT_OUT_DIR}"
  exec bash /marketplace/scripts/acceptance/run.sh "$@"
fi

printf 'Marketplace not mounted at /marketplace\n' >&2
exit 2
