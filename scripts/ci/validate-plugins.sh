#!/usr/bin/env bash
# Shared plugin marketplace validation for GitHub Actions and GitLab CI.
# Keep both CI definitions calling this script so the pipelines stay aligned.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

CLAUDE_CODE_VERSION="${CLAUDE_CODE_VERSION:-2.1.170}"
CODEX_VERSION="${CODEX_VERSION:-0.146.0}"
MARKETPLACE_NAME="${MARKETPLACE_NAME:-harness-start}"
SKIP_HOST_INSTALL="${SKIP_HOST_INSTALL:-0}"
SKIP_CODEX_LOAD="${SKIP_CODEX_LOAD:-0}"

log() {
  printf '==> %s\n' "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

install_hosts_if_needed() {
  if [ "${SKIP_HOST_INSTALL}" = "1" ]; then
    log "Skipping host install (SKIP_HOST_INSTALL=1)"
    return
  fi

  if command -v claude >/dev/null 2>&1 && command -v codex >/dev/null 2>&1; then
    log "Claude Code and Codex already available; skipping install"
    return
  fi

  log "Installing Claude Code ${CLAUDE_CODE_VERSION} and Codex ${CODEX_VERSION}"
  npm install --global \
    "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
    "@openai/codex@${CODEX_VERSION}"
}

validate_json() {
  log "Validating JSON files"
  require_cmd jq

  find .claude-plugin .agents/plugins plugins \
    -type f \
    -name '*.json' \
    -print0 |
  while IFS= read -r -d '' file; do
    printf 'Validating %s\n' "${file}"
    jq empty "${file}"
  done
}

check_scripts() {
  log "Checking plugin scripts"
  require_cmd node

  local -a files=()
  mapfile -t files < <(find plugins -path '*/scripts/*.mjs' -type f | sort)

  if [ "${#files[@]}" -eq 0 ]; then
    printf 'No plugin scripts found under plugins/*/scripts/**/*.mjs\n' >&2
    exit 1
  fi

  local file
  for file in "${files[@]}"; do
    printf 'Checking %s\n' "${file}"
    node --check "${file}"
  done
}

check_unit_tests() {
  log "Running offline unit tests for every plugin"
  require_cmd node

  local plugin name
  local -a test_files=()
  for plugin in plugins/*; do
    [ -d "${plugin}" ] || continue
    name="$(basename "${plugin}")"
    test_files=()
    if [ -d "${plugin}/tests" ]; then
      mapfile -t test_files < <(
        find "${plugin}/tests" -maxdepth 1 -name '*.test.mjs' -type f | sort
      )
    fi
    if [ "${#test_files[@]}" -eq 0 ]; then
      printf 'Plugin has no offline unit tests: %s\n' "${name}" >&2
      exit 1
    fi
    printf 'Testing %s (%s file(s))\n' "${name}" "${#test_files[@]}"
    node --test "${test_files[@]}"
  done
}

check_acceptance_suites() {
  log "Checking dual-host acceptance suites and expect honesty"

  local plugin name cases_dir case_dir hosts
  local found_case
  for plugin in plugins/*; do
    [ -d "${plugin}" ] || continue
    name="$(basename "${plugin}")"
    cases_dir="${plugin}/acceptance/cases"
    if [ ! -f "${plugin}/acceptance/README.md" ]; then
      printf 'Plugin acceptance README missing: %s\n' "${name}" >&2
      exit 1
    fi
    if [ ! -d "${cases_dir}" ]; then
      printf 'Plugin acceptance cases missing: %s\n' "${name}" >&2
      exit 1
    fi

    found_case=0
    for case_dir in "${cases_dir}"/*; do
      [ -d "${case_dir}" ] || continue
      found_case=1
      for required in case.toml prompt.md expect.sh; do
        if [ ! -s "${case_dir}/${required}" ]; then
          printf 'Acceptance case file missing or empty: %s/%s\n' \
            "${case_dir}" "${required}" >&2
          exit 1
        fi
      done
      if [ ! -d "${case_dir}/workspace" ]; then
        printf 'Acceptance workspace fixture missing: %s/workspace\n' \
          "${case_dir}" >&2
        exit 1
      fi
      hosts="$(
        sed -n 's/.*hosts[[:space:]]*=[[:space:]]*\[\(.*\)\].*/\1/p' \
          "${case_dir}/case.toml" | tr -d '" ' | tr ',' '\n' \
          | tr '[:upper:]' '[:lower:]'
      )"
      if ! printf '%s\n' "${hosts}" | grep -Fxq claude \
        || ! printf '%s\n' "${hosts}" | grep -Fxq codex; then
        printf 'Acceptance case must declare both claude and codex: %s\n' \
          "${case_dir}/case.toml" >&2
        exit 1
      fi
      bash -n "${case_dir}/expect.sh"
    done
    if [ "${found_case}" -eq 0 ]; then
      printf 'Plugin has no acceptance cases: %s\n' "${name}" >&2
      exit 1
    fi
  done

  local honesty_dir
  honesty_dir="$(mktemp -d)"
  if ! bash scripts/acceptance/check-expect-honesty.sh "${honesty_dir}"; then
    rm -rf -- "${honesty_dir}"
    exit 1
  fi
  rm -rf -- "${honesty_dir}"
}

check_manifest_versions() {
  log "Checking dual-platform manifest versions"
  require_cmd jq

  local plugin claude_version codex_version
  local found=0

  for plugin in plugins/*; do
    [ -d "${plugin}" ] || continue
    found=1

    claude_version="$(
      jq -r '.version' "${plugin}/.claude-plugin/plugin.json"
    )"
    codex_version="$(
      jq -r '.version' "${plugin}/.codex-plugin/plugin.json"
    )"

    if [ "${claude_version}" = "null" ] || [ -z "${claude_version}" ]; then
      printf 'Missing Claude version: %s\n' "${plugin}" >&2
      exit 1
    fi

    if [ "${claude_version}" != "${codex_version}" ]; then
      printf 'Version mismatch in %s: claude=%s codex=%s\n' \
        "${plugin}" "${claude_version}" "${codex_version}" >&2
      exit 1
    fi

    printf '%s: %s\n' "${plugin}" "${claude_version}"
  done

  if [ "${found}" -eq 0 ]; then
    printf 'No plugin directories found under plugins/\n' >&2
    exit 1
  fi
}

check_marketplace_registration() {
  log "Checking plugins are registered in both marketplace indexes"
  require_cmd jq

  local claude_marketplace=".claude-plugin/marketplace.json"
  local codex_marketplace=".agents/plugins/marketplace.json"
  local failed=0
  local plugin name expected_source claude_source codex_source
  local claude_marketplace_name codex_marketplace_name codex_display_name
  local -a disk_plugins=()
  local -a claude_plugins=()
  local -a codex_plugins=()

  claude_marketplace_name="$(jq -r '.name // empty' "${claude_marketplace}")"
  codex_marketplace_name="$(jq -r '.name // empty' "${codex_marketplace}")"
  codex_display_name="$(
    jq -r '.interface.displayName // empty' "${codex_marketplace}"
  )"

  if [ "${claude_marketplace_name}" != "${MARKETPLACE_NAME}" ]; then
    printf 'Claude marketplace name is %s (expected %s)\n' \
      "${claude_marketplace_name:-<empty>}" "${MARKETPLACE_NAME}" >&2
    failed=1
  fi

  if [ "${codex_marketplace_name}" != "${MARKETPLACE_NAME}" ]; then
    printf 'Codex marketplace name is %s (expected %s)\n' \
      "${codex_marketplace_name:-<empty>}" "${MARKETPLACE_NAME}" >&2
    failed=1
  fi

  if [ "${claude_marketplace_name}" != "${codex_marketplace_name}" ]; then
    printf 'Claude/Codex marketplace .name fields differ: %s vs %s\n' \
      "${claude_marketplace_name:-<empty>}" \
      "${codex_marketplace_name:-<empty>}" >&2
    failed=1
  fi

  printf 'Marketplace name: %s\n' "${MARKETPLACE_NAME}"
  if [ -n "${codex_display_name}" ]; then
    printf 'Codex displayName: %s\n' "${codex_display_name}"
  fi

  mapfile -t claude_plugins < <(
    jq -r '.plugins[].name // empty' "${claude_marketplace}" | sort -u
  )
  mapfile -t codex_plugins < <(
    jq -r '.plugins[].name // empty' "${codex_marketplace}" | sort -u
  )

  for plugin in plugins/*; do
    [ -d "${plugin}" ] || continue
    disk_plugins+=("$(basename "${plugin}")")
  done

  IFS=$'\n' disk_plugins=($(printf '%s\n' "${disk_plugins[@]:-}" | sort -u))
  unset IFS

  printf 'Disk plugins: %s\n' "${disk_plugins[*]:-<none>}"
  printf 'Claude marketplace: %s\n' "${claude_plugins[*]:-<none>}"
  printf 'Codex marketplace: %s\n' "${codex_plugins[*]:-<none>}"

  if [ "${#claude_plugins[@]}" -eq 0 ] && [ "${#disk_plugins[@]}" -gt 0 ]; then
    printf 'Claude marketplace has no plugins, but plugins/ is not empty\n' >&2
    failed=1
  fi

  if [ "${#codex_plugins[@]}" -eq 0 ] && [ "${#disk_plugins[@]}" -gt 0 ]; then
    printf 'Codex marketplace has no plugins, but plugins/ is not empty\n' >&2
    failed=1
  fi

  # Marketplaces must list the same plugin names.
  local claude_joined codex_joined
  claude_joined="$(printf '%s\n' "${claude_plugins[@]:-}")"
  codex_joined="$(printf '%s\n' "${codex_plugins[@]:-}")"
  if [ "${claude_joined}" != "${codex_joined}" ]; then
    printf 'Claude and Codex marketplace plugin name sets differ\n' >&2
    printf 'Only in Claude:\n'
    comm -23 <(printf '%s\n' "${claude_plugins[@]:-}") \
      <(printf '%s\n' "${codex_plugins[@]:-}") >&2 || true
    printf 'Only in Codex:\n'
    comm -13 <(printf '%s\n' "${claude_plugins[@]:-}") \
      <(printf '%s\n' "${codex_plugins[@]:-}") >&2 || true
    failed=1
  fi

  # Every on-disk plugin must be registered in both marketplaces.
  for name in "${disk_plugins[@]:-}"; do
    [ -n "${name}" ] || continue

    if ! printf '%s\n' "${claude_plugins[@]:-}" | grep -Fxq -- "${name}"; then
      printf 'Plugin on disk missing from Claude marketplace: %s\n' "${name}" >&2
      failed=1
    fi

    if ! printf '%s\n' "${codex_plugins[@]:-}" | grep -Fxq -- "${name}"; then
      printf 'Plugin on disk missing from Codex marketplace: %s\n' "${name}" >&2
      failed=1
    fi

    expected_source="./plugins/${name}"
    claude_source="$(
      jq -r --arg name "${name}" \
        '.plugins[] | select(.name == $name) | .source // empty' \
        "${claude_marketplace}"
    )"
    codex_source="$(
      jq -r --arg name "${name}" \
        '.plugins[] | select(.name == $name) | .source.path // empty' \
        "${codex_marketplace}"
    )"

    if [ "${claude_source}" != "${expected_source}" ]; then
      printf 'Claude marketplace source for %s is %s (expected %s)\n' \
        "${name}" "${claude_source:-<empty>}" "${expected_source}" >&2
      failed=1
    fi

    if [ "${codex_source}" != "${expected_source}" ]; then
      printf 'Codex marketplace source for %s is %s (expected %s)\n' \
        "${name}" "${codex_source:-<empty>}" "${expected_source}" >&2
      failed=1
    fi
  done

  # Marketplace entries must not point at missing plugin directories.
  for name in "${claude_plugins[@]:-}"; do
    [ -n "${name}" ] || continue
    if [ ! -d "plugins/${name}" ]; then
      printf 'Claude marketplace entry has no plugins/%s directory\n' "${name}" >&2
      failed=1
    fi
  done

  for name in "${codex_plugins[@]:-}"; do
    [ -n "${name}" ] || continue
    if [ ! -d "plugins/${name}" ]; then
      printf 'Codex marketplace entry has no plugins/%s directory\n' "${name}" >&2
      failed=1
    fi
  done

  if [ "${failed}" -ne 0 ]; then
    printf 'Marketplace registration check failed\n' >&2
    exit 1
  fi

  log "Marketplace registration check passed"
}

validate_claude() {
  log "Validating Claude marketplace and plugins"
  require_cmd claude

  claude plugin validate --strict .
  local plugin
  for plugin in plugins/*; do
    [ -d "${plugin}" ] || continue
    printf 'Validating %s\n' "${plugin}"
    claude plugin validate --strict "${plugin}"
  done
}

load_codex_marketplace() {
  if [ "${SKIP_CODEX_LOAD}" = "1" ]; then
    log "Skipping Codex marketplace load (SKIP_CODEX_LOAD=1)"
    return
  fi

  log "Loading Codex marketplace"
  require_cmd codex
  require_cmd jq

  local codex_home
  codex_home="${CODEX_HOME:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/codex-home-ci-$$}"
  export CODEX_HOME="${codex_home}"
  mkdir -p "${CODEX_HOME}"

  codex plugin marketplace add . --json
  codex plugin list \
    --marketplace "${MARKETPLACE_NAME}" \
    --available \
    --json |
  jq .

  # Ensure every on-disk plugin is discoverable via Codex marketplace listing.
  local available name
  available="$(
    codex plugin list \
      --marketplace "${MARKETPLACE_NAME}" \
      --available \
      --json |
    jq -r '.available[]?.name // empty' | sort -u
  )"

  for plugin in plugins/*; do
    [ -d "${plugin}" ] || continue
    name="$(basename "${plugin}")"
    if ! printf '%s\n' "${available}" | grep -Fxq -- "${name}"; then
      printf 'Plugin not available in Codex marketplace listing: %s\n' "${name}" >&2
      exit 1
    fi
  done

  log "Codex marketplace load check passed"
}

main() {
  log "Root: ${ROOT_DIR}"
  require_cmd node
  require_cmd npm
  require_cmd jq

  install_hosts_if_needed
  validate_json
  check_scripts
  check_unit_tests
  check_acceptance_suites
  check_manifest_versions
  check_marketplace_registration
  validate_claude
  load_codex_marketplace

  log "All plugin validations passed"
}

main "$@"
