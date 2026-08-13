#!/usr/bin/env bash
# Project-level host acceptance: full catalog via install-all.sh + scenario cases.
#
# Unlike per-plugin acceptance (single --plugin-dir / single plugin add), project
# cases install every marketplace plugin and all skill-deps.json community skills
# through scripts/install-all.sh --local <checkout>, then run real Claude/Codex
# sessions against a workspace fixture using open-ended briefs.
#
# Live sessions are Docker-only (same image as plugin acceptance).
#
# Usage (repo root on host):
#   ./scripts/acceptance/run-project.sh
#   ./scripts/acceptance/run-project.sh --case logo-design/01-goal-e2e-delivery
#   ./scripts/acceptance/run-project.sh --case logo-design/01-goal-e2e-delivery --host claude
#   ./scripts/acceptance/run-project.sh --honesty-only
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/project-common.sh
. "${SCRIPT_DIR}/lib/project-common.sh"

CASE_FILTER=""
HOST_FILTER="both"
USE_DOCKER=0
SKIP_HONESTY=0
HONESTY_ONLY=0
OUT_DIR="${ACCEPT_OUT_DIR:-${REPO_ROOT}/.acceptance-runs/project-latest}"
SCENARIOS_ROOT="${REPO_ROOT}/acceptance/scenarios"

usage() {
  sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --case) CASE_FILTER="${2:-}"; shift 2 ;;
    --host) HOST_FILTER="${2:-}"; shift 2 ;;
    --docker) USE_DOCKER=1; shift ;;
    --skip-honesty) SKIP_HONESTY=1; shift ;;
    --honesty-only) HONESTY_ONLY=1; shift ;;
    --out) OUT_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown arg: %s\n' "$1" >&2; usage; exit 2 ;;
  esac
done

load_env_file "${REPO_ROOT}"
mkdir -p "${OUT_DIR}"
OUT_DIR="$(cd "${OUT_DIR}" && pwd)"
SUMMARY="${OUT_DIR}/summary.txt"
REPORT="${OUT_DIR}/project-acceptance.log"

# Default host skills mount for logo/design scenarios.
if [ -z "${ACCEPT_HOST_SKILLS_DIR:-}" ] && [ -d "${HOME}/.agents/skills" ]; then
  export ACCEPT_HOST_SKILLS_DIR="${HOME}/.agents/skills"
fi

log() {
  printf '%s\n' "$*" | tee -a "${REPORT}"
}

in_acceptance_container() {
  if [ "${ACCEPT_IN_CONTAINER:-0}" = "1" ]; then
    return 0
  fi
  if [ -f /.dockerenv ] && [ -f /opt/acceptance/entrypoint.sh ]; then
    return 0
  fi
  return 1
}

check_project_honesty() {
  local honesty_out="${OUT_DIR}/honesty"
  mkdir -p "${honesty_out}"
  local failed=0 checked=0
  local case_id case_dir expect_sh prompt_md host work inert_log run_id rc safe_id

  mapfile -t cases < <(list_project_cases "${SCENARIOS_ROOT}")
  if [ "${#cases[@]}" -eq 0 ]; then
    log "FAIL: no project cases under ${SCENARIOS_ROOT}"
    return 1
  fi

  for case_id in "${cases[@]}"; do
    case_dir="$(project_case_dir "${SCENARIOS_ROOT}" "${case_id}")"
    expect_sh="${case_dir}/expect.sh"
    prompt_md="${case_dir}/prompt.md"
    if [ ! -f "${expect_sh}" ] || [ ! -f "${prompt_md}" ]; then
      log "FAIL project/${case_id}: missing expect.sh or prompt.md"
      failed=$((failed + 1))
      continue
    fi
    for host in claude codex; do
      checked=$((checked + 1))
      safe_id="${case_id//\//__}"
      work="${honesty_out}/project__${safe_id}__${host}/workspace"
      mkdir -p "${work}"
      if [ -d "${case_dir}/workspace" ]; then
        cp -a "${case_dir}/workspace/." "${work}/"
      fi
      if [ ! -d "${work}/.git" ]; then
        git -C "${work}" init -q 2>/dev/null || true
      fi
      inert_log="${honesty_out}/project__${safe_id}__${host}/inert-host.log"
      run_id="project__${safe_id}__${host}"
      {
        echo "workdir: ${honesty_out}/${run_id}/workspace"
        echo "model: deepseek-v4-flash"
        echo "provider: deepseek"
        echo "----- prompt (inert, no tools) -----"
        cat "${prompt_md}"
        echo
        echo "----- model refuse (no hook fire) -----"
        echo "I'm not going to perform that write. No tools were used."
        echo "session complete without tool calls."
      } >"${inert_log}"

      export ACCEPT_REPO="${REPO_ROOT}"
      export ACCEPT_WORKSPACE="${work}"
      export ACCEPT_LOG="${inert_log}"
      export ACCEPT_HOST="${host}"
      export ACCEPT_PLUGIN="project"
      export ACCEPT_CASE="${case_id}"
      export ACCEPT_SUITE="project"
      export ACCEPT_PLUGIN_DIR=""
      export ACCEPT_OUT="${honesty_out}/${run_id}"
      export HOME="${honesty_out}/${run_id}/home"
      mkdir -p "${HOME}" "${ACCEPT_OUT}"

      set +e
      bash "${expect_sh}" >"${honesty_out}/${run_id}/expect.out" 2>&1
      rc=$?
      set -e
      if [ "${rc}" -eq 0 ]; then
        log "FAIL project/${case_id}/${host}: expect greened inert log (rc=0)"
        failed=$((failed + 1))
      else
        log "PASS project/${case_id}/${host}: inert expect failed closed (rc=${rc})"
      fi
    done
  done

  log "project honesty checked=${checked} failed=${failed}"
  [ "${failed}" -eq 0 ] && [ "${checked}" -gt 0 ]
}

if [ "${HONESTY_ONLY}" -eq 1 ]; then
  : >"${REPORT}"
  check_project_honesty
  exit $?
fi

if [ "${SKIP_HONESTY}" -ne 1 ]; then
  : >"${REPORT}"
  log "Running project expect honesty gate"
  if ! check_project_honesty; then
    log "PROJECT HONESTY GATE FAILED"
    exit 1
  fi
  log "Project honesty gate passed"
fi

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
  log "Project host acceptance is Docker-only; building/running ${IMAGE}"
  docker build \
    -t "${IMAGE}" \
    -f "${REPO_ROOT}/docker/host-acceptance/Dockerfile" \
    "${REPO_ROOT}/docker/host-acceptance"

  args=(--skip-honesty)
  [ -n "${CASE_FILTER}" ] && args+=(--case "${CASE_FILTER}")
  [ "${HOST_FILTER}" != "both" ] && args+=(--host "${HOST_FILTER}")

  host_uid="$(id -u)"
  host_gid="$(id -g)"
  docker_args=(
    --rm
    --user "${host_uid}:${host_gid}"
    -e DEEPSEEK_API_KEY
    -e DEEPSEEK_MODEL
    -e ACCEPT_OUT_DIR=/out
    -e ACCEPT_IN_CONTAINER=1
    -e HOME=/out/.container-home
    -e USER="${USER:-acceptance}"
    -v "${REPO_ROOT}:/marketplace:ro"
    -v "${OUT_DIR}:/out"
    -w /marketplace
    --entrypoint /bin/bash
  )
  # Mount host Agent Skills so logo-design etc. are available inside the case HOME.
  if [ -n "${ACCEPT_HOST_SKILLS_DIR:-}" ] && [ -d "${ACCEPT_HOST_SKILLS_DIR}" ]; then
    docker_args+=(-e ACCEPT_HOST_SKILLS_DIR=/opt/host-skills)
    docker_args+=(-v "${ACCEPT_HOST_SKILLS_DIR}:/opt/host-skills:ro")
    log "Mounting host skills from ${ACCEPT_HOST_SKILLS_DIR}"
  fi

  docker run "${docker_args[@]}" \
    "${IMAGE}" \
    /marketplace/scripts/acceptance/run-project.sh "${args[@]}"
  exit $?
fi

: >"${SUMMARY}"
if [ ! -s "${REPORT}" ]; then
  : >"${REPORT}"
fi

if [ ! -d "${SCENARIOS_ROOT}" ]; then
  log "FAIL: missing ${SCENARIOS_ROOT}"
  exit 1
fi

mapfile -t cases < <(list_project_cases "${SCENARIOS_ROOT}")
if [ "${#cases[@]}" -eq 0 ]; then
  log "FAIL: no project cases"
  exit 1
fi

failed=0
passed=0

for case_id in "${cases[@]}"; do
  if [ -n "${CASE_FILTER}" ] && [ "${case_id}" != "${CASE_FILTER}" ]; then
    continue
  fi
  case_dir="$(project_case_dir "${SCENARIOS_ROOT}" "${case_id}")"
  mapfile -t hosts < <(read_case_hosts "${case_dir}" | tr ' ' '\n' | sed '/^$/d')
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
    bash "${SCRIPT_DIR}/lib/run-project-case.sh" \
      "${REPO_ROOT}" "${case_id}" "${host}" "${OUT_DIR}" \
      | tee -a "${REPORT}"
    rc=${PIPESTATUS[0]}
    set -e
    if [ "${rc}" -eq 0 ]; then
      passed=$((passed + 1))
      echo "PASS project/${case_id}/${host}" >>"${SUMMARY}"
    else
      failed=$((failed + 1))
      echo "FAIL project/${case_id}/${host}" >>"${SUMMARY}"
    fi
  done
done

{
  printf '\n'
  printf 'PROJECT SUMMARY\n'
  printf 'passed=%s failed=%s\n' "${passed}" "${failed}"
  printf 'out=%s\n' "${OUT_DIR}"
  if [ -f "${SUMMARY}" ]; then
    cat "${SUMMARY}"
  fi
} | tee -a "${REPORT}" || true

if [ "${failed}" -ne 0 ]; then
  exit 1
fi
if [ "${passed}" -eq 0 ]; then
  log "No project cases ran"
  exit 1
fi
exit 0
