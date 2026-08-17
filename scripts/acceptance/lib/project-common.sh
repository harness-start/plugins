#!/usr/bin/env bash
# Project-level acceptance helpers: full marketplace install via install-all.sh.
# shellcheck disable=SC2034

set -euo pipefail

project_acceptance_root() {
  # scripts/acceptance/lib -> repo root
  cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd
}

# Acceptance scenarios root is acceptance/scenarios (no extra "project" layer).
# Cases live at:
#   scenarios/<domain>/cases/<case-id>/
# Printed ids: <domain>/<case-id>
list_project_cases() {
  local scenarios_root="$1"
  if [ ! -d "${scenarios_root}" ]; then
    return 0
  fi
  find "${scenarios_root}" -mindepth 3 -maxdepth 3 -type d -path '*/cases/*' \
    | while IFS= read -r path; do
        relative_path="${path#"${scenarios_root}/"}"
        printf '%s\n' "${relative_path}" | sed -E 's#^([^/]+)/cases/(.+)$#\1/\2#'
      done \
    | sort
}

# Resolve case id (domain/case) → absolute case directory under scenarios root.
project_case_dir() {
  local scenarios_root="$1"
  local case_id="$2"
  local domain="${case_id%%/*}"
  local id="${case_id#*/}"
  if [ "${domain}" = "${case_id}" ] || [ -z "${id}" ]; then
    printf 'invalid project case id (want domain/case): %s\n' "${case_id}" >&2
    return 1
  fi
  printf '%s/%s/cases/%s\n' "${scenarios_root}" "${domain}" "${id}"
}

# Fingerprint for install-all cache invalidation (catalog + runtime payload + installer).
project_install_fingerprint() {
  local repo_root="$1"
  {
    printf 'install-all\n'
    sha256sum "${repo_root}/scripts/install-all.sh" | awk '{print $1}'
    printf 'marketplace\n'
    sha256sum "${repo_root}/.claude-plugin/marketplace.json" | awk '{print $1}'
    if [ -f "${repo_root}/.agents/plugins/marketplace.json" ]; then
      sha256sum "${repo_root}/.agents/plugins/marketplace.json" | awk '{print $1}'
    fi
    printf 'plugin-manifests\n'
    find "${repo_root}/plugins" \
      \( -path '*/.claude-plugin/plugin.json' \
        -o -path '*/.codex-plugin/plugin.json' \
        -o -path '*/hooks/*.json' \
        -o -path '*/mcp/*.json' \
        -o -name '.mcp.json' \
        -o -path '*/dist/*' \
        -o -path '*/skills/*' \) \
      -type f \
      | sort \
      | while IFS= read -r f; do
          sha256sum "${f}"
        done
  } | sha256sum | awk '{print $1}'
}

# Ensure install-all has populated cache_home for the current catalog.
# Prints absolute cache home path on stdout.
ensure_project_install_cache() {
  local repo_root="$1"
  local cache_root="$2"
  local host="$3"
  local fp cache_home stamp install_log
  local -a install_args=()

  fp="$(project_install_fingerprint "${repo_root}")"
  mkdir -p "${cache_root}"
  cache_home="$(cd "${cache_root}" && pwd)/full-catalog-${host}"
  stamp="${cache_home}/.project-install-fingerprint"
  install_log="${cache_home}/install-all.log"

  if [ -f "${stamp}" ] && [ "$(cat "${stamp}" 2>/dev/null || true)" = "${fp}" ] \
    && [ -s "${install_log}" ] \
    && grep -Eq 'Done|install' "${install_log}"; then
    # Light readiness: logo guard plugin must be present for logo project cases.
    if [ -d "${cache_home}/.claude" ] || [ -d "${cache_home}/.codex" ] || [ -d "${cache_home}/.agents/skills" ]; then
      printf '%s\n' "${cache_home}"
      return 0
    fi
  fi

  printf 'project-accept: building install-all cache for host=%s\n' "${host}" >&2
  rm -rf "${cache_home}"
  mkdir -p "${cache_home}"

  install_args=(--local "${repo_root}" --language en-US --fail-fast)
  case "${host}" in
    claude) install_args+=(--claude-only) ;;
    codex) install_args+=(--codex-only) ;;
    both)
      # Full dual-host install into one HOME (skills once; both CLIs).
      :
      ;;
    *)
      printf 'project-accept: unknown host for install cache: %s\n' "${host}" >&2
      return 1
      ;;
  esac

  (
    export HOME="${cache_home}"
    # Codex config lives under CODEX_HOME when set; pin under HOME for cache portability.
    export CODEX_HOME="${cache_home}/.codex"
    mkdir -p "${CODEX_HOME}"
    export npm_config_cache="${cache_home}/.npm"
    # Avoid host user identity issues inside containers.
    export USER="${USER:-acceptance}"
    set +e
    bash "${repo_root}/scripts/install-all.sh" "${install_args[@]}" >"${install_log}" 2>&1
    local rc=$?
    set -e
    if [ "${rc}" -ne 0 ]; then
      printf 'project-accept: install-all failed (rc=%s); tail of log:\n' "${rc}" >&2
      tail -n 80 "${install_log}" >&2 || true
      exit "${rc}"
    fi
  ) || return 1

  printf '%s\n' "${fp}" >"${stamp}"
  printf '%s\n' "${cache_home}"
  return 0
}

# Seed a case HOME from the install-all cache (plugins + community skills).
seed_project_install_home() {
  local cache_home="$1"
  local dest_home="$2"

  if [ -z "${cache_home}" ] || [ ! -d "${cache_home}" ]; then
    printf 'project-accept: missing install cache home\n' >&2
    return 1
  fi
  mkdir -p "${dest_home}"

  # Copy user-scope trees produced by install-all / skills CLI.
  local entry
  for entry in .claude .codex .agents .npm; do
    if [ -e "${cache_home}/${entry}" ]; then
      cp -a "${cache_home}/${entry}" "${dest_home}/"
    fi
  done
  if [ -f "${cache_home}/install-all.log" ]; then
    cp -a "${cache_home}/install-all.log" "${dest_home}/install-all.log"
  fi
  return 0
}

# Assert install-all completed with every plugin in the current marketplace.
assert_project_install_ready() {
  local dest_home="$1"
  local repo_root="${2:-$(project_acceptance_root)}"
  local install_log="${dest_home}/install-all.log"
  local catalog="${repo_root}/.claude-plugin/marketplace.json"
  local plugin
  local -a expected_plugins=()

  if [ ! -s "${install_log}" ]; then
    printf 'project-accept: missing install-all.log under %s\n' "${dest_home}" >&2
    return 1
  fi
  if [ ! -s "${catalog}" ]; then
    printf 'project-accept: missing marketplace catalog: %s\n' "${catalog}" >&2
    return 1
  fi

  mapfile -t expected_plugins < <(jq -r '.plugins[]?.name // empty' "${catalog}")
  if [ "${#expected_plugins[@]}" -eq 0 ]; then
    printf 'project-accept: marketplace catalog contains no plugins\n' >&2
    return 1
  fi

  for plugin in "${expected_plugins[@]}"; do
    if ! grep -Eq "(^|[[:space:]])${plugin}([[:space:]]|$)" "${install_log}"; then
      printf 'project-accept: install-all log is missing catalog plugin %s\n' \
        "${plugin}" >&2
      return 1
    fi
  done
  return 0
}
