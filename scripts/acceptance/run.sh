#!/usr/bin/env bash
# Host-acceptance runner for harness-start plugins.
#
# Live Claude Code / Codex sessions (DeepSeek V4 Flash) are Docker-only.
# From the host, this script always builds and runs docker/host-acceptance.
# Inside the image (ACCEPT_IN_CONTAINER=1), it executes cases directly.
#
# Usage (from repo root on the host):
#   ./scripts/acceptance/run.sh                          # all plugins × both hosts (Docker)
#   ./scripts/acceptance/run.sh --plugin command-safety
#   ./scripts/acceptance/run.sh --plugin command-safety --case 01-deny-cat-heredoc --host claude
#   ./scripts/acceptance/run.sh --smoke                  # DeepSeek smoke (Docker)
#   ./scripts/acceptance/run.sh --honesty-only           # inert expect gate only (no Docker, no API)
#   ./scripts/acceptance/run.sh --docker                 # accepted alias; Docker is already required
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

PLUGIN_FILTER=""
CASE_FILTER=""
HOST_FILTER="both"
USE_DOCKER=0
SMOKE_ONLY=0
SKIP_HONESTY=0
HONESTY_ONLY=0
OUT_DIR="${ACCEPT_OUT_DIR:-${REPO_ROOT}/.acceptance-runs/latest}"

usage() {
  sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --plugin) PLUGIN_FILTER="${2:-}"; shift 2 ;;
    --case) CASE_FILTER="${2:-}"; shift 2 ;;
    --host) HOST_FILTER="${2:-}"; shift 2 ;;
    --docker) USE_DOCKER=1; shift ;;
    --smoke) SMOKE_ONLY=1; shift ;;
    --skip-honesty) SKIP_HONESTY=1; shift ;;
    --honesty-only) HONESTY_ONLY=1; shift ;;
    --out) OUT_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown arg: %s\n' "$1" >&2; usage; exit 2 ;;
  esac
done

mkdir -p "${OUT_DIR}"
OUT_DIR="$(cd "${OUT_DIR}" && pwd)"
SUMMARY="${OUT_DIR}/summary.txt"
REPORT="${OUT_DIR}/acceptance-all.log"

log() {
  printf '%s\n' "$*" | tee -a "${REPORT}"
}

in_acceptance_container() {
  if [ "${ACCEPT_IN_CONTAINER:-0}" = "1" ]; then
    return 0
  fi
  # Fallback when entrypoint env is missing but we are still in the image.
  if [ -f /.dockerenv ] && [ -f /opt/acceptance/entrypoint.sh ]; then
    return 0
  fi
  return 1
}

if [ "${HONESTY_ONLY}" -eq 1 ]; then
  bash "${SCRIPT_DIR}/check-expect-honesty.sh" "${OUT_DIR}/honesty" | tee "${OUT_DIR}/honesty-gate.log"
  exit $?
fi

load_env_file "${REPO_ROOT}"

if [ "${SKIP_HONESTY}" -ne 1 ] && [ "${SMOKE_ONLY}" -ne 1 ]; then
  : >"${REPORT}"
  log "Running expect honesty gate (inert logs must fail-closed)"
  if ! bash "${SCRIPT_DIR}/check-expect-honesty.sh" "${OUT_DIR}/honesty" | tee -a "${REPORT}" | tee "${OUT_DIR}/honesty-gate.log"; then
    log "HONESTY GATE FAILED"
    exit 1
  fi
  log "Honesty gate passed"
fi

# Live smoke/suites: never invoke claude/codex on the host.
# Always wrap Docker unless we are already inside the acceptance image.
if ! in_acceptance_container; then
  USE_DOCKER=1
fi

if [ "${USE_DOCKER}" -eq 1 ]; then
  if in_acceptance_container; then
    printf 'error: nested Docker wrap inside acceptance container is not allowed\n' >&2
    exit 2
  fi
  require_cmd docker
  IMAGE="${ACCEPT_IMAGE:-harness-host-acceptance:local}"
  log "Live host acceptance is Docker-only; building/running ${IMAGE}"
  docker build \
    -t "${IMAGE}" \
    -f "${REPO_ROOT}/docker/host-acceptance/Dockerfile" \
    "${REPO_ROOT}/docker/host-acceptance"

  # Older root-container runs leave root-owned files under OUT_DIR. Host user
  # often has no sudo; docker group can still chown/rm via a one-shot root
  # container (entrypoint bypassed). Only touch known smoke/home paths.
  if [ "${SMOKE_ONLY}" -eq 1 ]; then
    log "Purging prior smoke artifacts under ${OUT_DIR} (root leftovers ok)"
    docker run --rm --user 0:0 --entrypoint /bin/bash \
      -v "${OUT_DIR}:/out" \
      "${IMAGE}" \
      -lc 'rm -rf /out/smoke-ws /out/smoke-home /out/smoke-codex-home /out/deepseek-host-smoke-*.log /out/deepseek-host-smoke-*.claude-debug.log /out/latest 2>/dev/null || true'
  fi

  # Re-invoke this script inside the container (entrypoint sets ACCEPT_IN_CONTAINER=1)
  args=(--skip-honesty)
  [ -n "${PLUGIN_FILTER}" ] && args+=(--plugin "${PLUGIN_FILTER}")
  [ -n "${CASE_FILTER}" ] && args+=(--case "${CASE_FILTER}")
  [ "${HOST_FILTER}" != "both" ] && args+=(--host "${HOST_FILTER}")
  [ "${SMOKE_ONLY}" -eq 1 ] && args+=(--smoke)
  # Claude refuses --dangerously-skip-permissions when euid is 0. Run as the
  # invoking host user so /out artifacts are writable and not owned by root.
  host_uid="$(id -u)"
  host_gid="$(id -g)"
  docker run --rm \
    --user "${host_uid}:${host_gid}" \
    -e DEEPSEEK_API_KEY \
    -e DEEPSEEK_MODEL \
    -e ACCEPT_OUT_DIR=/out \
    -e ACCEPT_IN_CONTAINER=1 \
    -e HOME=/out/.container-home \
    -e USER="${USER:-acceptance}" \
    -v "${REPO_ROOT}:/marketplace:ro" \
    -v "${OUT_DIR}:/out" \
    -w /marketplace \
    "${IMAGE}" \
    "${args[@]}"
  exit $?
fi

: >"${SUMMARY}"
# Keep honesty section in REPORT if present; otherwise start fresh for live suite.
if [ ! -s "${REPORT}" ]; then
  : >"${REPORT}"
fi

if [ "${SMOKE_ONLY}" -eq 1 ]; then
  require_cmd claude
  require_cmd codex
  # Unique dirs so a failed prior run never blocks (even if purge missed something).
  smoke_stamp="$$"
  smoke_ws="${OUT_DIR}/smoke-ws-${smoke_stamp}"
  smoke_home="${OUT_DIR}/smoke-home-${smoke_stamp}"
  smoke_codex_home="${OUT_DIR}/smoke-codex-home-${smoke_stamp}"
  mkdir -p "${smoke_ws}"
  git -C "${smoke_ws}" init -q
  echo ok >"${smoke_ws}/README.md"
  git -C "${smoke_ws}" add -A
  git -C "${smoke_ws}" -c user.email=a@b -c user.name=a commit -q -m init --allow-empty

  export HOME="${smoke_home}"
  mkdir -p "${HOME}"
  configure_claude_home "${HOME}" "${DEEPSEEK_MODEL}"
  claude_log="${OUT_DIR}/deepseek-host-smoke-claude.log"
  set +e
  run_claude_session "${smoke_ws}" "${REPO_ROOT}/plugins/command-safety" \
    <(printf 'Reply with exactly: PONG\n') "${claude_log}" 90
  set -e
  if ! grep -q 'PONG' "${claude_log}"; then
    log "SMOKE FAIL claude (see ${claude_log})"
    exit 1
  fi
  log "SMOKE PASS claude model=${DEEPSEEK_MODEL}"

  export CODEX_HOME="${smoke_codex_home}"
  mkdir -p "${CODEX_HOME}"
  configure_codex_home "${CODEX_HOME}" "${DEEPSEEK_MODEL}" \
    "${REPO_ROOT}/docker/host-acceptance/models.json"
  codex_log="${OUT_DIR}/deepseek-host-smoke-codex.log"
  set +e
  run_codex_session "${smoke_ws}" "command-safety" "${REPO_ROOT}" \
    <(printf 'Reply with exactly: PONG and do not modify files.\n') "${codex_log}" 120
  set -e
  if ! grep -q 'PONG' "${codex_log}"; then
    log "SMOKE FAIL codex (see ${codex_log})"
    exit 1
  fi
  if ! grep -Eq "model:[[:space:]]*${DEEPSEEK_MODEL}|deepseek-v4-flash" "${codex_log}"; then
    log "SMOKE FAIL codex model not deepseek"
    exit 1
  fi
  log "SMOKE PASS codex model=${DEEPSEEK_MODEL}"
  exit 0
fi

plugins=()
if [ -n "${PLUGIN_FILTER}" ]; then
  plugins=("${PLUGIN_FILTER}")
else
  while IFS= read -r plugin; do plugins+=("${plugin}"); done < <(list_plugins "${REPO_ROOT}")
fi

failed=0
passed=0
skipped=0

for plugin in "${plugins[@]}"; do
  plugin_dir="${REPO_ROOT}/plugins/${plugin}"
  if [ ! -d "${plugin_dir}" ]; then
    log "FAIL marketplace plugin missing on disk: ${plugin}"
    failed=$((failed + 1))
    continue
  fi
  cases=()
  while IFS= read -r case_id; do cases+=("${case_id}"); done < <(list_cases "${plugin_dir}")
  if [ "${#cases[@]}" -eq 0 ]; then
    log "FAIL marketplace plugin has no acceptance/cases suite: ${plugin}"
    failed=$((failed + 1))
    continue
  fi
  for case_id in "${cases[@]}"; do
    if [ -n "${CASE_FILTER}" ] && [ "${case_id}" != "${CASE_FILTER}" ]; then
      continue
    fi
    case_dir="${plugin_dir}/acceptance/cases/${case_id}"
    hosts=()
    while IFS= read -r host; do hosts+=("${host}"); done < <(read_case_hosts "${case_dir}" | tr ' ' '\n' | sed '/^$/d')
    for host in "${hosts[@]}"; do
      host="$(echo "${host}" | tr -d '[:space:]')"
      [ -n "${host}" ] || continue
      if [ "${HOST_FILTER}" = "claude" ] && [ "${host}" != "claude" ]; then
        continue
      fi
      if [ "${HOST_FILTER}" = "codex" ] && [ "${host}" != "codex" ]; then
        continue
      fi
      set +e
      bash "${SCRIPT_DIR}/lib/run-case.sh" \
        "${REPO_ROOT}" "${plugin}" "${case_id}" "${host}" "${OUT_DIR}" \
        | tee -a "${REPORT}"
      rc=${PIPESTATUS[0]}
      set -e
      if [ "${rc}" -eq 0 ]; then
        passed=$((passed + 1))
        echo "PASS ${plugin}/${case_id}/${host}" >>"${SUMMARY}"
      else
        failed=$((failed + 1))
        echo "FAIL ${plugin}/${case_id}/${host}" >>"${SUMMARY}"
      fi
    done
  done
done

log ""
log "==== SUMMARY ===="
log "passed=${passed} failed=${failed} skipped=${skipped}"
log "out=${OUT_DIR}"
cat "${SUMMARY}" | tee -a "${REPORT}" || true

if [ "${failed}" -ne 0 ]; then
  exit 1
fi
if [ "${passed}" -eq 0 ]; then
  log "No cases ran"
  exit 1
fi
exit 0
