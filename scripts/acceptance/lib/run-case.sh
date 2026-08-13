#!/usr/bin/env bash
# Run one acceptance case for one host.
# Usage: run-case.sh <repo_root> <plugin> <case_id> <host> <out_dir>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
. "${SCRIPT_DIR}/common.sh"

REPO_ROOT="$(cd "${1:?repo_root}" && pwd)"
PLUGIN="${2:?plugin}"
CASE_ID="${3:?case_id}"
HOST="${4:?host}"
OUT_DIR="${5:?out_dir}"
mkdir -p "${OUT_DIR}"
OUT_DIR="$(cd "${OUT_DIR}" && pwd)"

PLUGIN_DIR="${REPO_ROOT}/plugins/${PLUGIN}"
CASE_DIR="${PLUGIN_DIR}/acceptance/cases/${CASE_ID}"
MODELS_JSON="${REPO_ROOT}/docker/host-acceptance/models.json"

if [ ! -d "${CASE_DIR}" ]; then
  printf 'Case directory missing: %s\n' "${CASE_DIR}" >&2
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

RUN_ID="${PLUGIN}__${CASE_ID}__${HOST}"
CASE_OUT="${OUT_DIR}/${RUN_ID}"
rm -rf "${CASE_OUT}"
mkdir -p "${CASE_OUT}/workspace" "${CASE_OUT}/home"

copy_workspace "${CASE_DIR}" "${CASE_OUT}/workspace"
TIMEOUT_SEC="$(read_case_timeout "${CASE_DIR}")"
ALLOWED_HOST_EXITS="$(read_case_allowed_host_exits "${CASE_DIR}" "${HOST}")"
LOG_FILE="${CASE_OUT}/host.log"
STATUS_FILE="${CASE_OUT}/status.txt"

export ACCEPT_WORKSPACE="${CASE_OUT}/workspace"
export ACCEPT_HOST="${HOST}"
export ACCEPT_LOG="${LOG_FILE}"
export ACCEPT_PLUGIN="${PLUGIN}"
export ACCEPT_CASE="${CASE_ID}"
export ACCEPT_OUT="${CASE_OUT}"
export ACCEPT_REPO="${REPO_ROOT}"
export ACCEPT_PLUGIN_DIR="${PLUGIN_DIR}"
# ensure helpers can resolve repo even if ACCEPT_REPO is unset in nested shells
export ACCEPT_REPO
export HOME="${CASE_OUT}/home"
export CLAUDE_PLUGIN_DATA="${CASE_OUT}/home/.claude-plugin-data"
export PLUGIN_DATA="${CASE_OUT}/home/.plugin-data"
mkdir -p "${CLAUDE_PLUGIN_DATA}" "${PLUGIN_DATA}" "${HOME}/.harness-start/hook-state"

printf '==> %s / %s / %s (timeout=%ss)\n' "${PLUGIN}" "${CASE_ID}" "${HOST}" "${TIMEOUT_SEC}"

# Community skill-deps must land in the isolated case HOME before the host
# session starts (same deps install-all.sh would install globally for users).
SKILL_DEPS_CACHE="${ACCEPT_SKILL_DEPS_CACHE:-${OUT_DIR}/skill-deps-cache}"
if ! install_plugin_skill_deps "${PLUGIN_DIR}" "${HOME}" "${SKILL_DEPS_CACHE}" "${HOST}"; then
  printf 'skill-deps install failed for %s\n' "${PLUGIN}" >&2
  printf 'RESULT=FAIL\n' >"${STATUS_FILE}"
  printf 'skill_deps=fail\n' >>"${STATUS_FILE}"
  printf 'expect_exit=n/a\n' >>"${STATUS_FILE}"
  printf 'host_exit=n/a\n' >>"${STATUS_FILE}"
  printf 'FAIL %s (skill-deps install)\n' "${RUN_ID}" >&2
  exit 1
fi

HOST_EXIT=0
if [ "${HOST}" = "claude" ]; then
  require_cmd claude
  configure_claude_home "${HOME}" "${DEEPSEEK_MODEL}"
  set +e
  run_claude_session \
    "${ACCEPT_WORKSPACE}" \
    "${PLUGIN_DIR}" \
    "${CASE_DIR}/prompt.md" \
    "${LOG_FILE}" \
    "${TIMEOUT_SEC}"
  HOST_EXIT=$?
  set -e
elif [ "${HOST}" = "codex" ]; then
  require_cmd codex
  # Codex refuses helper binaries under /tmp; keep CODEX_HOME under the repo
  # when case out lives in /tmp, otherwise under the absolute case out dir.
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
  configure_codex_home "${CODEX_HOME}" "${DEEPSEEK_MODEL}" "${MODELS_JSON}"
  set +e
  run_codex_session \
    "${ACCEPT_WORKSPACE}" \
    "${PLUGIN}" \
    "${REPO_ROOT}" \
    "${CASE_DIR}/prompt.md" \
    "${LOG_FILE}" \
    "${TIMEOUT_SEC}"
  HOST_EXIT=$?
  set -e
else
  printf 'Unknown host: %s\n' "${HOST}" >&2
  exit 2
fi

printf 'host_exit=%s\n' "${HOST_EXIT}" >"${STATUS_FILE}"
printf 'allowed_host_exits=%s\n' "${ALLOWED_HOST_EXITS}" >>"${STATUS_FILE}"
printf 'skill_deps=ok\n' >>"${STATUS_FILE}"
printf 'model=%s\n' "${DEEPSEEK_MODEL}" >>"${STATUS_FILE}"
printf 'host=%s\n' "${HOST}" >>"${STATUS_FILE}"

# DeepSeek routing sanity (non-fatal for claude if only env-based)
set +e
assert_deepseek_in_log "${LOG_FILE}" "${HOST}"
DS_OK=$?
set -e
if [ "${DS_OK}" -ne 0 ]; then
  printf 'deepseek_check=fail\n' >>"${STATUS_FILE}"
else
  printf 'deepseek_check=ok\n' >>"${STATUS_FILE}"
fi

# Run semantic assertions for diagnostics even when the host failed.
set +e
bash "${CASE_DIR}/expect.sh"
EXPECT_EXIT=$?
set -e
printf 'expect_exit=%s\n' "${EXPECT_EXIT}" >>"${STATUS_FILE}"

if [ "${EXPECT_EXIT}" -eq 0 ] && host_exit_is_allowed "${HOST_EXIT}" "${ALLOWED_HOST_EXITS}"; then
  printf 'RESULT=PASS\n' >>"${STATUS_FILE}"
  printf 'PASS %s\n' "${RUN_ID}"
  exit 0
fi

printf 'RESULT=FAIL\n' >>"${STATUS_FILE}"
printf 'FAIL %s (expect_exit=%s host_exit=%s)\n' "${RUN_ID}" "${EXPECT_EXIT}" "${HOST_EXIT}" >&2
printf '  log: %s\n' "${LOG_FILE}" >&2
exit 1
