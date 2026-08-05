#!/usr/bin/env bash
# Structural honesty gate: every expect.sh must FAIL on an inert host log
# that contains prompt.md + workdir path + model refuse text, but ZERO real
# hook/product markers.
#
# No live API calls. Exit 0 only when every case fails-closed on inert input.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

OUT_DIR="${1:-${REPO_ROOT}/.acceptance-runs/honesty}"
mkdir -p "${OUT_DIR}"
REPORT="${OUT_DIR}/expect-honesty.log"
: >"${REPORT}"

log() { printf '%s\n' "$*" | tee -a "${REPORT}"; }

failed=0
checked=0

mapfile -t plugins < <(list_plugins "${REPO_ROOT}")
if [ "${#plugins[@]}" -eq 0 ]; then
  log "FAIL: marketplace has no plugins"
  exit 1
fi

for plugin in "${plugins[@]}"; do
  plugin_dir="${REPO_ROOT}/plugins/${plugin}"
  if [ ! -d "${plugin_dir}/acceptance/cases" ]; then
    log "FAIL ${plugin}: no acceptance/cases"
    failed=$((failed + 1))
    continue
  fi
  mapfile -t cases < <(list_cases "${plugin_dir}")
  if [ "${#cases[@]}" -eq 0 ]; then
    log "FAIL ${plugin}: empty acceptance/cases"
    failed=$((failed + 1))
    continue
  fi

  for case_id in "${cases[@]}"; do
    case_dir="${plugin_dir}/acceptance/cases/${case_id}"
    expect_sh="${case_dir}/expect.sh"
    prompt_md="${case_dir}/prompt.md"
    if [ ! -f "${expect_sh}" ] || [ ! -f "${prompt_md}" ]; then
      log "FAIL ${plugin}/${case_id}: missing expect.sh or prompt.md"
      failed=$((failed + 1))
      continue
    fi

    for host in claude codex; do
      checked=$((checked + 1))
      work="${OUT_DIR}/${plugin}__${case_id}__${host}/workspace"
      mkdir -p "${work}"
      # Copy fixture so world-state checks see a clean baseline (no protected files).
      if [ -d "${case_dir}/workspace" ]; then
        cp -a "${case_dir}/workspace/." "${work}/"
      fi
      # Ensure git if fixture had one
      if [ ! -d "${work}/.git" ]; then
        git -C "${work}" init -q 2>/dev/null || true
      fi

      inert_log="${OUT_DIR}/${plugin}__${case_id}__${host}/inert-host.log"
      run_id="${plugin}__${case_id}__${host}"
      {
        echo "workdir: ${OUT_DIR}/${run_id}/workspace"
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
      export ACCEPT_PLUGIN="${plugin}"
      export ACCEPT_CASE="${case_id}"
      export ACCEPT_PLUGIN_DIR="${plugin_dir}"
      export ACCEPT_OUT="${OUT_DIR}/${run_id}"

      set +e
      bash "${expect_sh}" >"${OUT_DIR}/${run_id}/expect.out" 2>&1
      rc=$?
      set -e

      if [ "${rc}" -eq 0 ]; then
        log "FAIL ${plugin}/${case_id}/${host}: expect greened inert log (rc=0)"
        sed -n '1,20p' "${OUT_DIR}/${run_id}/expect.out" | tee -a "${REPORT}" || true
        failed=$((failed + 1))
      else
        log "PASS ${plugin}/${case_id}/${host}: inert expect failed closed (rc=${rc})"
      fi
    done
  done
done

log ""
log "==== HONESTY SUMMARY ===="
log "checked=${checked} failed=${failed}"
log "report=${REPORT}"

if [ "${failed}" -ne 0 ]; then
  exit 1
fi
if [ "${checked}" -eq 0 ]; then
  log "FAIL: no cases checked"
  exit 1
fi
exit 0
