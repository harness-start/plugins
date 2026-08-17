#!/usr/bin/env bash
# Run one project-level acceptance case for one host.
# Usage: run-project-case.sh <repo_root> <case_id> <host> <out_dir>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
. "${SCRIPT_DIR}/common.sh"
# shellcheck source=project-common.sh
. "${SCRIPT_DIR}/project-common.sh"

REPO_ROOT="$(cd "${1:?repo_root}" && pwd)"
CASE_ID="${2:?case_id}"
HOST="${3:?host}"
OUT_DIR="${4:?out_dir}"
mkdir -p "${OUT_DIR}"
OUT_DIR="$(cd "${OUT_DIR}" && pwd)"

SCENARIOS_ROOT="${REPO_ROOT}/acceptance/scenarios"
CASE_DIR="$(project_case_dir "${SCENARIOS_ROOT}" "${CASE_ID}")"
MODELS_JSON="${REPO_ROOT}/docker/host-acceptance/models.json"

if [ ! -d "${CASE_DIR}" ]; then
  printf 'Project case directory missing: %s\n' "${CASE_DIR}" >&2
  exit 2
fi
if [ ! -f "${CASE_DIR}/prompt.md" ]; then
  printf 'Missing prompt.md in %s\n' "${CASE_DIR}" >&2
  exit 2
fi
if [ ! -f "${CASE_DIR}/expect.sh" ]; then
  printf 'Missing expect.sh in %s\n' "${CASE_DIR}" >&2
  exit 2
fi

load_env_file "${REPO_ROOT}"
require_cmd git
require_cmd node
require_cmd jq
require_cmd timeout
require_cmd npx

# Slash in case id is unsafe for a single path segment.
SAFE_CASE_ID="${CASE_ID//\//__}"
RUN_ID="project__${SAFE_CASE_ID}__${HOST}"
CASE_OUT="${OUT_DIR}/${RUN_ID}"
rm -rf "${CASE_OUT}"
mkdir -p "${CASE_OUT}/workspace" "${CASE_OUT}/home"

copy_workspace "${CASE_DIR}" "${CASE_OUT}/workspace"
TIMEOUT_SEC="$(read_case_timeout "${CASE_DIR}")"
LOG_FILE="${CASE_OUT}/host.log"
STATUS_FILE="${CASE_OUT}/status.txt"

export ACCEPT_WORKSPACE="${CASE_OUT}/workspace"
export ACCEPT_HOST="${HOST}"
export ACCEPT_LOG="${LOG_FILE}"
export ACCEPT_PLUGIN="project"
export ACCEPT_CASE="${CASE_ID}"
export ACCEPT_OUT="${CASE_OUT}"
export ACCEPT_REPO="${REPO_ROOT}"
export ACCEPT_SUITE="project"
export ACCEPT_PLUGIN_DIR=""
export HOME="${CASE_OUT}/home"
export CLAUDE_PLUGIN_DATA="${CASE_OUT}/home/.claude-plugin-data"
export PLUGIN_DATA="${CASE_OUT}/home/.plugin-data"
mkdir -p "${CLAUDE_PLUGIN_DATA}" "${PLUGIN_DATA}" "${HOME}/.harness-start/hook-state"

printf '==> project / %s / %s (timeout=%ss)\n' "${CASE_ID}" "${HOST}" "${TIMEOUT_SEC}"

# Cache must live under writable OUT_DIR: Docker mounts the marketplace read-only.
INSTALL_CACHE_ROOT="${ACCEPT_PROJECT_INSTALL_CACHE:-${OUT_DIR}/project-install-cache}"
set +e
CACHE_HOME="$(ensure_project_install_cache "${REPO_ROOT}" "${INSTALL_CACHE_ROOT}" "${HOST}")"
INSTALL_RC=$?
set -e
if [ "${INSTALL_RC}" -ne 0 ] || [ -z "${CACHE_HOME}" ]; then
  printf 'RESULT=FAIL\n' >"${STATUS_FILE}"
  printf 'install_all=fail\n' >>"${STATUS_FILE}"
  printf 'FAIL %s (install-all)\n' "${RUN_ID}" >&2
  exit 1
fi

if ! seed_project_install_home "${CACHE_HOME}" "${HOME}"; then
  printf 'RESULT=FAIL\n' >"${STATUS_FILE}"
  printf 'install_all=seed_fail\n' >>"${STATUS_FILE}"
  printf 'FAIL %s (seed install home)\n' "${RUN_ID}" >&2
  exit 1
fi

if ! assert_project_install_ready "${HOME}" "${REPO_ROOT}"; then
  printf 'RESULT=FAIL\n' >"${STATUS_FILE}"
  printf 'install_all=not_ready\n' >>"${STATUS_FILE}"
  printf 'FAIL %s (install readiness)\n' "${RUN_ID}" >&2
  exit 1
fi

# Design / domain skills live outside plugin skill-deps; seed when available.
seed_host_skills_into_home "${HOME}" || true
printf 'install_all=ok\n' >"${STATUS_FILE}"

HOST_EXIT=0
EXPECT_EXIT=0
DS_OK=0
if [ "${HOST}" = "claude" ]; then
  require_cmd claude
  configure_claude_home "${HOME}" "${DEEPSEEK_MODEL}"
  set +e
  run_claude_session_installed \
    "${ACCEPT_WORKSPACE}" \
    "${CASE_DIR}/prompt.md" \
    "${LOG_FILE}" \
    "${TIMEOUT_SEC}"
  HOST_EXIT=$?
  set -e
elif [ "${HOST}" = "codex" ]; then
  require_cmd codex
  if [[ "${CASE_OUT}" == /tmp/* ]]; then
    export CODEX_HOME="${REPO_ROOT}/.acceptance-runs/codex-homes/${RUN_ID}"
    rm -rf "${CODEX_HOME}"
    mkdir -p "${CODEX_HOME}"
  else
    export CODEX_HOME="${CASE_OUT}/codex-home"
    mkdir -p "${CODEX_HOME}"
  fi
  CODEX_HOME="$(cd "${CODEX_HOME}" && pwd)"
  export CODEX_HOME
  # Preserve plugins/skills already seeded into HOME; only write model config.
  # Merge: copy seeded .codex content into CODEX_HOME when distinct.
  if [ -d "${HOME}/.codex" ] && [ "${CODEX_HOME}" != "${HOME}/.codex" ]; then
    cp -a "${HOME}/.codex/." "${CODEX_HOME}/" 2>/dev/null || true
  fi
  configure_codex_home "${CODEX_HOME}" "${DEEPSEEK_MODEL}" "${MODELS_JSON}"
  set +e
  run_codex_session_installed \
    "${ACCEPT_WORKSPACE}" \
    "${CASE_DIR}/prompt.md" \
    "${LOG_FILE}" \
    "${TIMEOUT_SEC}"
  HOST_EXIT=$?
  set -e
else
  printf 'Unknown host: %s\n' "${HOST}" >&2
  exit 2
fi

# Rewrite status after the host returns (do not rely on earlier partial status alone).
{
  printf 'host_exit=%s\n' "${HOST_EXIT}"
  printf 'install_all=ok\n'
  printf 'model=%s\n' "${DEEPSEEK_MODEL}"
  printf 'host=%s\n' "${HOST}"
  printf 'suite=project\n'
} >"${STATUS_FILE}" || true

set +e
assert_deepseek_in_log "${LOG_FILE}" "${HOST}"
DS_OK=$?
set -e
if [ "${DS_OK}" -ne 0 ]; then
  printf 'deepseek_check=fail\n' >>"${STATUS_FILE}" || true
else
  printf 'deepseek_check=ok\n' >>"${STATUS_FILE}" || true
fi

set +e
bash "${CASE_DIR}/expect.sh"
EXPECT_EXIT=$?
set -e
printf 'expect_exit=%s\n' "${EXPECT_EXIT}" >>"${STATUS_FILE}" || true

if [ "${EXPECT_EXIT}" -eq 0 ] && [ "${HOST_EXIT}" -eq 0 ]; then
  printf 'RESULT=PASS\n' >>"${STATUS_FILE}" || true
  printf 'PASS %s\n' "${RUN_ID}"
  exit 0
fi

printf 'RESULT=FAIL\n' >>"${STATUS_FILE}" || true
printf 'FAIL %s (expect_exit=%s host_exit=%s)\n' "${RUN_ID}" "${EXPECT_EXIT}" "${HOST_EXIT}" >&2
printf '  log: %s\n' "${LOG_FILE}" >&2
exit 1
