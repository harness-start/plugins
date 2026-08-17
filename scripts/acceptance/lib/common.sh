#!/usr/bin/env bash
# Shared helpers for host-level plugin acceptance (Claude Code + Codex).
# shellcheck disable=SC2034

set -euo pipefail

acceptance_root() {
  # scripts/acceptance/lib -> repo root
  cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd
}

load_env_file() {
  local repo_root="$1"
  local env_file="${repo_root}/.env"
  if [ ! -f "${env_file}" ]; then
    printf 'Missing %s (need DEEPSEEK_API_KEY and DEEPSEEK_MODEL)\n' "${env_file}" >&2
    return 1
  fi
  set -a
  # shellcheck disable=SC1090
  . "${env_file}"
  set +a
  if [ -z "${DEEPSEEK_API_KEY:-}" ]; then
    printf 'DEEPSEEK_API_KEY is empty in .env\n' >&2
    return 1
  fi
  DEEPSEEK_MODEL="${DEEPSEEK_MODEL:-deepseek-v4-flash}"
  if [ "${DEEPSEEK_MODEL}" != "deepseek-v4-flash" ] && [ -z "${ACCEPT_ALLOW_OTHER_MODEL:-}" ]; then
    printf 'Warning: DEEPSEEK_MODEL=%s (expected deepseek-v4-flash for dual-host support)\n' \
      "${DEEPSEEK_MODEL}" >&2
  fi
  export DEEPSEEK_API_KEY DEEPSEEK_MODEL
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    return 1
  fi
}

list_plugins() {
  local repo_root="$1"
  local marketplace="${repo_root}/.claude-plugin/marketplace.json"
  if [ ! -f "${marketplace}" ]; then
    printf 'Missing marketplace: %s\n' "${marketplace}" >&2
    return 1
  fi
  # Marketplace is the source of truth for "existing plugins".
  jq -r '.plugins[].name // empty' "${marketplace}" | sort -u
}

require_plugin_acceptance() {
  local repo_root="$1"
  local plugin="$2"
  local cases_dir="${repo_root}/plugins/${plugin}/acceptance/cases"
  if [ ! -d "${repo_root}/plugins/${plugin}" ]; then
    printf 'Marketplace plugin missing on disk: %s\n' "${plugin}" >&2
    return 1
  fi
  if [ ! -d "${cases_dir}" ] || ! compgen -G "${cases_dir}/*/" >/dev/null; then
    printf 'Marketplace plugin has no acceptance/cases suite: %s\n' "${plugin}" >&2
    return 1
  fi
  return 0
}

list_cases() {
  local plugin_dir="$1"
  local cases_dir="${plugin_dir}/acceptance/cases"
  if [ ! -d "${cases_dir}" ]; then
    return 0
  fi
  find "${cases_dir}" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort
}

read_case_hosts() {
  # Prints space-separated hosts from case.toml hosts = ["claude","codex"]
  local case_dir="$1"
  local toml="${case_dir}/case.toml"
  if [ ! -f "${toml}" ]; then
    echo "claude codex"
    return 0
  fi
  if grep -qE 'hosts[[:space:]]*=' "${toml}"; then
    # shellcheck disable=SC2002
    cat "${toml}" | tr -d '[]"' | sed -n 's/.*hosts[[:space:]]*=[[:space:]]*//p' | tr ',' ' '
  else
    echo "claude codex"
  fi
}

read_case_timeout() {
  local case_dir="$1"
  local toml="${case_dir}/case.toml"
  local default="${ACCEPT_DEFAULT_TIMEOUT:-300}"
  if [ -f "${toml}" ] && grep -qE 'timeout_sec[[:space:]]*=' "${toml}"; then
    sed -n 's/.*timeout_sec[[:space:]]*=[[:space:]]*\([0-9][0-9]*\).*/\1/p' "${toml}" | head -1
  else
    echo "${default}"
  fi
}

read_case_allowed_host_exits() {
  local case_dir="$1"
  local host="$2"
  local toml="${case_dir}/case.toml"
  local key="allowed_host_exits_${host}"
  local values=""
  if [ -f "${toml}" ]; then
    values="$(sed -n "s/.*${key}[[:space:]]*=[[:space:]]*\[\([^]]*\)\].*/\1/p" "${toml}" | head -1 | tr ',' ' ' | tr -s ' ')"
  fi
  if [ -n "${values// /}" ]; then
    printf '%s\n' "${values}"
  else
    printf '0\n'
  fi
}

host_exit_is_allowed() {
  local actual="$1"
  local allowed="$2"
  local candidate
  for candidate in ${allowed}; do
    if [ "${candidate}" = "${actual}" ]; then
      return 0
    fi
  done
  return 1
}

copy_workspace() {
  local case_dir="$1"
  local dest="$2"
  rm -rf "${dest}"
  mkdir -p "${dest}"
  if [ -d "${case_dir}/workspace" ]; then
    cp -a "${case_dir}/workspace/." "${dest}/"
  fi
  # Ensure git repo for tools that need it
  if [ ! -d "${dest}/.git" ]; then
    git -C "${dest}" init -q
    git -C "${dest}" config user.email "accept@harness-start.local"
    git -C "${dest}" config user.name "Acceptance"
    git -C "${dest}" add -A
    git -C "${dest}" commit -q -m "acceptance fixture" --allow-empty
  fi
}

configure_claude_home() {
  local home_dir="$1"
  local model="$2"
  local settings_file tmp_file
  mkdir -p "${home_dir}/.claude"
  settings_file="${home_dir}/.claude/settings.json"
  tmp_file="${settings_file}.tmp.$$"

  if [ ! -s "${settings_file}" ] \
    || ! jq -e 'type == "object"' "${settings_file}" >/dev/null 2>&1; then
    printf '{}\n' >"${settings_file}"
  fi

  # Merge the model and permission settings into the installer's settings.
  # Project acceptance seeds enabledPlugins and extraKnownMarketplaces before
  # this function runs; replacing the file would silently disable the catalog.
  jq \
    --arg api_key "${DEEPSEEK_API_KEY}" \
    --arg model "${model}" \
    '
      . * {
        hasTrustDialogAccepted: true,
        env: ((.env // {}) + {
          ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
          ANTHROPIC_AUTH_TOKEN: $api_key,
          ANTHROPIC_MODEL: $model,
          ANTHROPIC_DEFAULT_OPUS_MODEL: $model,
          ANTHROPIC_DEFAULT_SONNET_MODEL: $model,
          ANTHROPIC_DEFAULT_HAIKU_MODEL: $model,
          CLAUDE_CODE_SUBAGENT_MODEL: $model,
          CLAUDE_CODE_EFFORT_LEVEL: "low"
        }),
        permissions: ((.permissions // {}) + {
          defaultMode: "bypassPermissions",
          allow: ["*"]
        })
      }
    ' "${settings_file}" >"${tmp_file}"
  mv "${tmp_file}" "${settings_file}"
}

configure_codex_home() {
  local codex_home="$1"
  local model="$2"
  local models_json_src="$3"
  mkdir -p "${codex_home}"
  codex_home="$(cd "${codex_home}" && pwd)"
  cp "${models_json_src}" "${codex_home}/models.json"
  cat > "${codex_home}/config.toml" <<EOF
model = "${model}"
model_provider = "deepseek"
preferred_auth_method = "apikey"
model_reasoning_effort = "low"
model_catalog_json = "${codex_home}/models.json"
approval_policy = "never"
sandbox_mode = "danger-full-access"

[model_providers.deepseek]
name = "deepseek"
base_url = "https://api.deepseek.com/"
wire_api = "responses"
experimental_bearer_token = "${DEEPSEEK_API_KEY}"
EOF
}

install_codex_plugin() {
  local marketplace="$1"
  local plugin="$2"
  # Drop cached plugin copy so local source edits are picked up (Codex caches by version).
  if [ -n "${CODEX_HOME:-}" ]; then
    rm -rf "${CODEX_HOME}/plugins/cache/harness-start/${plugin}" \
      "${CODEX_HOME}/plugins/cache/${plugin}" 2>/dev/null || true
  fi
  codex plugin marketplace add "${marketplace}" --json >/dev/null 2>&1 || \
    codex plugin marketplace add "${marketplace}" >/dev/null
  # Prefer add; if already present, re-add after cache wipe
  codex plugin uninstall "${plugin}@harness-start" --json >/dev/null 2>&1 || true
  codex plugin add "${plugin}@harness-start" --json >/dev/null 2>&1 \
    || codex plugin add "${plugin}@harness-start" >/dev/null 2>&1 \
    || true
}

# --- community skill-deps (skill-deps.json) for acceptance isolation -----------
#
# Live acceptance uses an isolated HOME per case. Community skills declared in
# plugins/<name>/skill-deps.json must be installed into that HOME so Claude Code
# and Codex see the same deps install-all.sh would place in the user global
# scope. Installation reads only the repository's prepared vendor-skills tree;
# missing manifests, vendor content, or identity mismatches fail closed.

plugin_skill_deps_file() {
  local plugin_dir="$1"
  printf '%s/skill-deps.json\n' "${plugin_dir}"
}

# Parse skill-deps JSON → stdout lines: name<TAB>source.
# Returns 0 for valid object (including empty skills[]). Returns 1 on error.
parse_skill_deps_json() {
  local json="$1"
  local label="${2:-skill-deps.json}"

  if [ -z "${json}" ]; then
    printf 'empty skill-deps payload: %s\n' "${label}" >&2
    return 1
  fi
  if ! command -v jq >/dev/null 2>&1; then
    printf 'jq is required to parse %s\n' "${label}" >&2
    return 1
  fi
  if ! printf '%s' "${json}" | jq -e 'type == "object"' >/dev/null 2>&1; then
    printf '%s: root must be a JSON object\n' "${label}" >&2
    return 1
  fi
  if ! printf '%s' "${json}" | jq -e 'has("skills") and (.skills | type == "array")' >/dev/null 2>&1; then
    printf '%s: missing required "skills" array\n' "${label}" >&2
    return 1
  fi
  local bad
  bad="$(
    printf '%s' "${json}" | jq -r '
      .skills
      | to_entries[]
      | select(
          (.value | type != "object")
          or ((.value.name // "") | type != "string")
          or ((.value.name // "") | length == 0)
          or ((.value.source // "") | type != "string")
          or ((.value.source // "") | length == 0)
          or (.value | has("revision"))
          or (.value | has("subpath"))
          or ((.value | has("execution")) and (
            (.value.mode != "audited-executable")
            or ((.value.execution | type) != "object")
            or (.value.execution.approved != true)
            or ((.value.execution.paths | type) != "array")
            or ((.value.execution.paths | length) == 0)
            or (.value.execution.paths | any(
              (type != "object")
              or ((.path // "") | type != "string")
              or (((.path // "") | test("^[A-Za-z0-9._/-]+$")) | not)
              or ((.path // "") | startswith("/"))
              or ((.path // "") | split("/") | any(. == "" or . == "." or . == ".." or startswith("-")))
              or ((.sha256 // "") | test("^[0-9a-f]{64}$") | not)
            ))
          ))
          or ((.value.mode // "") == "audited-executable" and ((.value | has("execution")) | not))
        )
      | "\(.key)"
    '
  )"
  if [ -n "${bad}" ]; then
    printf '%s: each skills[] entry needs name/source and must not declare revision or subpath\n' "${label}" >&2
    return 1
  fi
  printf '%s' "${json}" | jq -r '
    .skills[]?
    | select((.name | type == "string") and (.name | length > 0)
             and (.source | type == "string") and (.source | length > 0))
    | "\(.name)\t\(.source)"
  '
  return 0
}

# List skill deps for a plugin dir. No skill-deps.json → exit 0, empty stdout.
# Invalid manifest → non-zero.
list_plugin_skill_deps() {
  local plugin_dir="$1"
  local deps_file
  deps_file="$(plugin_skill_deps_file "${plugin_dir}")"
  if [ ! -f "${deps_file}" ]; then
    return 0
  fi
  parse_skill_deps_json "$(cat "${deps_file}")" "${deps_file}"
}

skill_deps_agents_for_host() {
  local host="$1"
  case "${host}" in
    claude) printf '%s\n' "claude-code" ;;
    codex) printf '%s\n' "codex" ;;
    both|"")
      printf '%s\n' "claude-code"
      printf '%s\n' "codex"
      ;;
    *)
      # Unknown host: still dual-install so either CLI can load the skill.
      printf '%s\n' "claude-code"
      printf '%s\n' "codex"
      ;;
  esac
}

skill_dep_file_for_host() {
  local home_dir="$1"
  local name="$2"
  local host="${3:-both}"
  case "${host}" in
    claude) printf '%s/.claude/skills/%s/SKILL.md\n' "${home_dir}" "${name}" ;;
    codex|both|"") printf '%s/.agents/skills/%s/SKILL.md\n' "${home_dir}" "${name}" ;;
    *) printf '%s/.agents/skills/%s/SKILL.md\n' "${home_dir}" "${name}" ;;
  esac
}

skill_deps_cache_scope() {
  case "${1:-both}" in
    claude) printf '%s\n' "claude" ;;
    codex) printf '%s\n' "codex" ;;
    *) printf '%s\n' "both" ;;
  esac
}

acceptance_vendor_skills_root() {
  local root
  root="${ACCEPT_VENDOR_SKILLS_DIR:-$(acceptance_root)/vendor-skills}"
  if [ ! -d "${root}" ] || [ ! -f "${root}/index.json" ]; then
    printf 'skill-deps: prepared vendor-skills tree or index missing: %s\n' "${root}" >&2
    return 1
  fi
  (cd "${root}" && pwd)
}

validate_vendored_skill_identity() {
  local vendor_root="$1"
  local name="$2"
  local source="$3"
  if [ ! -f "${vendor_root}/${name}/SKILL.md" ]; then
    printf 'skill-deps: vendored SKILL.md missing for %s under %s\n' \
      "${name}" "${vendor_root}" >&2
    return 1
  fi
  if ! jq -e --arg name "${name}" --arg source "${source}" \
    '.schemaVersion == 1 and any(.skills[]?; .name == $name and .source == $source)' \
    "${vendor_root}/index.json" >/dev/null; then
    printf 'skill-deps: vendor index identity mismatch for %s <= %s\n' \
      "${name}" "${source}" >&2
    return 1
  fi
}

# Install one community skill into the current HOME (global user scope for that HOME).
install_skill_into_home() {
  local name="$1"
  local source="$2"
  local host="${3:-both}"
  local agent vendor_root
  local -a agent_args=()

  if ! command -v npx >/dev/null 2>&1; then
    printf 'npx is required to install skill-deps (missing on PATH)\n' >&2
    return 1
  fi

  while IFS= read -r agent; do
    [ -n "${agent}" ] || continue
    agent_args+=(-a "${agent}")
  done < <(skill_deps_agents_for_host "${host}")

  if [ "${#agent_args[@]}" -eq 0 ]; then
    agent_args=(-a claude-code -a codex)
  fi

  vendor_root="$(acceptance_vendor_skills_root)" || return 1
  validate_vendored_skill_identity "${vendor_root}" "${name}" "${source}" || return 1

  printf 'skill-deps: install %s from prepared vendor %s (upstream=%s HOME=%s agents=%s)\n' \
    "${name}" "${vendor_root}" "${source}" "${HOME}" \
    "$(skill_deps_agents_for_host "${host}" | tr '\n' ' ')" >&2

  # Always re-run add so cache rebuilds and prior partial installs are overwritten.
  # Route CLI noise to stderr: callers capture stdout for the cache path only.
  if ! npx --yes skills add "${vendor_root}" --skill "${name}" --global --yes "${agent_args[@]}" >&2; then
    printf 'skill-deps: failed to install %s from prepared vendor %s\n' \
      "${name}" "${vendor_root}" >&2
    return 1
  fi

  local installed_file
  installed_file="$(skill_dep_file_for_host "${HOME}" "${name}" "${host}")"
  if [ ! -f "${installed_file}" ]; then
    printf 'skill-deps: install reported success but SKILL.md missing for %s under %s\n' \
      "${name}" "${installed_file}" >&2
    return 1
  fi
  return 0
}

# Populate cache_home with all skill-deps for plugin_dir (fresh install).
populate_skill_deps_cache_home() {
  local plugin_dir="$1"
  local cache_home="$2"
  local host="${3:-both}"
  local deps_file line name source
  local -a deps=()

  deps_file="$(plugin_skill_deps_file "${plugin_dir}")"
  if [ ! -f "${deps_file}" ]; then
    return 0
  fi

  local deps_lines
  set +e
  deps_lines="$(list_plugin_skill_deps "${plugin_dir}")"
  local list_rc=$?
  set -e
  if [ "${list_rc}" -ne 0 ]; then
    return 1
  fi
  deps=()
  if [ -n "${deps_lines}" ]; then
    while IFS= read -r line; do deps+=("${line}"); done <<<"${deps_lines}"
  fi
  if [ "${#deps[@]}" -eq 0 ]; then
    # Valid empty skills[] — treat as no-op, but keep fingerprint stamp caller-side.
    return 0
  fi

  rm -rf "${cache_home}"
  mkdir -p "${cache_home}"

  (
    export HOME="${cache_home}"
    # skills CLI may write npm cache under HOME; keep it inside cache_home.
    export npm_config_cache="${cache_home}/.npm"
    for line in "${deps[@]}"; do
      [ -n "${line}" ] || continue
      name="${line%%$'\t'*}"
      source="${line#*$'\t'}"
      if [ -z "${name}" ] || [ -z "${source}" ] || [ "${name}" = "${line}" ]; then
        printf 'skill-deps: malformed line in %s: %s\n' "${deps_file}" "${line}" >&2
        exit 1
      fi
      install_skill_into_home "${name}" "${source}" "${host}" || exit 1
    done
  )
}

skill_deps_fingerprint() {
  local deps_file="$1"
  local vendor_root
  if [ ! -f "${deps_file}" ]; then
    printf 'none\n'
    return 0
  fi
  vendor_root="$(acceptance_vendor_skills_root)" || return 1
  {
    sha256sum "${deps_file}"
    sha256sum "${vendor_root}/index.json"
  } | sha256sum | awk '{print $1}'
}

# Ensure a durable per-plugin skill-deps cache exists under cache_root.
# Prints absolute cache home path on stdout when deps exist; prints nothing when no deps file.
ensure_plugin_skill_deps_cache() {
  local plugin_dir="$1"
  local cache_root="$2"
  local host="${3:-both}"
  local plugin_name deps_file fp cache_home cache_scope stamp ready name line
  local -a deps=()

  plugin_name="$(basename "${plugin_dir}")"
  deps_file="$(plugin_skill_deps_file "${plugin_dir}")"
  if [ ! -f "${deps_file}" ]; then
    return 0
  fi

  local deps_lines
  set +e
  deps_lines="$(list_plugin_skill_deps "${plugin_dir}")"
  local list_rc=$?
  set -e
  if [ "${list_rc}" -ne 0 ]; then
    return 1
  fi
  deps=()
  if [ -n "${deps_lines}" ]; then
    while IFS= read -r line; do deps+=("${line}"); done <<<"${deps_lines}"
  fi
  # Empty skills[] is valid; still create a stamp so we do not re-parse forever.
  if [ "${#deps[@]}" -eq 0 ]; then
    fp="$(sha256sum "${deps_file}" | awk '{print $1}')"
  else
    fp="$(skill_deps_fingerprint "${deps_file}")" || return 1
  fi
  mkdir -p "${cache_root}"
  cache_scope="$(skill_deps_cache_scope "${host}")"
  cache_home="$(cd "${cache_root}" && pwd)/${plugin_name}-${cache_scope}"
  stamp="${cache_home}/.skill-deps-fingerprint"

  ready=1
  if [ ! -f "${stamp}" ] || [ "$(cat "${stamp}" 2>/dev/null || true)" != "${fp}" ]; then
    ready=0
  fi
  if [ "${ready}" -eq 1 ] && [ "${#deps[@]}" -gt 0 ]; then
    for line in "${deps[@]}"; do
      name="${line%%$'\t'*}"
      if [ ! -f "$(skill_dep_file_for_host "${cache_home}" "${name}" "${host}")" ]; then
        ready=0
        break
      fi
    done
  fi

  if [ "${ready}" -ne 1 ]; then
    printf 'skill-deps: building cache for %s (%s skill(s))\n' \
      "${plugin_name}" "${#deps[@]}" >&2
    if [ "${#deps[@]}" -eq 0 ]; then
      rm -rf "${cache_home}"
      mkdir -p "${cache_home}"
    else
      populate_skill_deps_cache_home "${plugin_dir}" "${cache_home}" "${host}" || return 1
    fi
    printf '%s\n' "${fp}" >"${stamp}"
  fi

  # Sole stdout payload: absolute cache home path for command substitution.
  printf '%s\n' "${cache_home}"
  return 0
}

# Copy cached skill trees into an isolated case HOME without clobbering settings.
seed_skill_deps_into_home() {
  local cache_home="$1"
  local dest_home="$2"
  local name

  if [ -z "${cache_home}" ] || [ ! -d "${cache_home}" ]; then
    return 0
  fi
  mkdir -p "${dest_home}"

  if [ -d "${cache_home}/.agents" ]; then
    mkdir -p "${dest_home}/.agents"
    if [ -f "${cache_home}/.agents/.skill-lock.json" ]; then
      cp -a "${cache_home}/.agents/.skill-lock.json" "${dest_home}/.agents/"
    fi
    if [ -d "${cache_home}/.agents/skills" ]; then
      mkdir -p "${dest_home}/.agents/skills"
      # Copy each skill dir so partial re-seeds do not wipe unrelated skills.
      for name in "${cache_home}/.agents/skills"/*; do
        [ -e "${name}" ] || continue
        cp -a "${name}" "${dest_home}/.agents/skills/"
      done
    fi
  fi

  if [ -d "${cache_home}/.claude/skills" ]; then
    mkdir -p "${dest_home}/.claude/skills"
    for name in "${cache_home}/.claude/skills"/*; do
      [ -e "${name}" ] || continue
      cp -a "${name}" "${dest_home}/.claude/skills/"
    done
  fi
  return 0
}

# Community skill-deps are gone. Keep the name so case runners stay compatible.
install_plugin_skill_deps() {
  return 0
}

_retired_install_plugin_skill_deps() {
  local plugin_dir="$1"
  local dest_home="$2"
  local cache_root="$3"
  local host="${4:-both}"
  local deps_file cache_home line name
  local -a deps=()

  deps_file="$(plugin_skill_deps_file "${plugin_dir}")"
  if [ ! -f "${deps_file}" ]; then
    return 0
  fi

  if [ "${ACCEPT_SKIP_SKILL_DEPS:-0}" = "1" ]; then
    printf 'skill-deps: skipped (ACCEPT_SKIP_SKILL_DEPS=1) for %s\n' "${plugin_dir}" >&2
    return 0
  fi

  if [ -z "${dest_home}" ]; then
    printf 'skill-deps: dest_home is required\n' >&2
    return 1
  fi
  if [ -z "${cache_root}" ]; then
    printf 'skill-deps: cache_root is required\n' >&2
    return 1
  fi

  local deps_lines
  set +e
  deps_lines="$(list_plugin_skill_deps "${plugin_dir}")"
  local list_rc=$?
  set -e
  if [ "${list_rc}" -ne 0 ]; then
    return 1
  fi
  deps=()
  if [ -n "${deps_lines}" ]; then
    while IFS= read -r line; do deps+=("${line}"); done <<<"${deps_lines}"
  fi

  cache_home="$(ensure_plugin_skill_deps_cache "${plugin_dir}" "${cache_root}" "${host}")" || return 1
  seed_skill_deps_into_home "${cache_home}" "${dest_home}" || return 1

  for line in "${deps[@]}"; do
    [ -n "${line}" ] || continue
    name="${line%%$'\t'*}"
    local installed_file
    installed_file="$(skill_dep_file_for_host "${dest_home}" "${name}" "${host}")"
    if [ ! -f "${installed_file}" ]; then
      printf 'skill-deps: after seed, missing %s in %s\n' \
        "${name}" "${installed_file}" >&2
      return 1
    fi
  done

  if [ "${#deps[@]}" -gt 0 ]; then
    printf 'skill-deps: seeded %s skill(s) into %s\n' "${#deps[@]}" "${dest_home}" >&2
  fi
  return 0
}

# Shared Claude -p invocation. When plugin_dir is non-empty, load only that
# plugin (per-plugin acceptance). When empty, rely on marketplace plugins
# already installed into HOME (project acceptance via install-all.sh).
_run_claude_session_core() {
  local workspace="$1"
  local plugin_dir="$2"
  local prompt_file="$3"
  local log_file="$4"
  local timeout_sec="$5"
  local model="${DEEPSEEK_MODEL}"

  export ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic"
  export ANTHROPIC_AUTH_TOKEN="${DEEPSEEK_API_KEY}"
  export ANTHROPIC_MODEL="${model}"
  export ANTHROPIC_DEFAULT_OPUS_MODEL="${model}"
  export ANTHROPIC_DEFAULT_SONNET_MODEL="${model}"
  export ANTHROPIC_DEFAULT_HAIKU_MODEL="${model}"
  export CLAUDE_CODE_SUBAGENT_MODEL="${model}"
  export CLAUDE_CODE_EFFORT_LEVEL="low"
  # Unset native Anthropic key so we never silently hit Anthropic
  unset ANTHROPIC_API_KEY || true

  local prompt
  prompt="$(cat "${prompt_file}")"

  local debug_file="${log_file%.log}.claude-debug.log"
  local force_tools
  if [ "${ACCEPT_SUITE:-plugin}" = "project" ]; then
    force_tools='You are running a project-level acceptance scenario with the full plugin catalog installed. Pursue the user request to the best deliverable you can produce in this session. Create real files under the workspace. Prefer production-quality artifacts over placeholders. Do not claim completion without coherent on-disk deliverables. Shell redirection to bypass denied writes is forbidden.'
  else
    force_tools='You are running an automated plugin-acceptance fixture. You MUST attempt the requested file Write/Edit/apply_patch tool call even when the path looks like cache/runtime/log. Do not refuse with policy arguments; the suite measures whether hooks deny the tool. Shell redirection is forbidden when the prompt forbids it.'
  fi
  local -a claude_args=(
    -p "${prompt}"
    --model "${model}"
    --dangerously-skip-permissions
    --permission-mode bypassPermissions
    --append-system-prompt "${force_tools}"
    --output-format text
    --debug
    --debug-file "${debug_file}"
  )
  if [ -n "${plugin_dir}" ]; then
    claude_args+=(--plugin-dir "${plugin_dir}")
  fi
  (
    cd "${workspace}"
    timeout "${timeout_sec}" claude "${claude_args[@]}"
  ) >"${log_file}" 2>&1
  local code=$?
  if [ -f "${debug_file}" ]; then
    {
      printf '\n===== claude-debug-file =====\n'
      cat "${debug_file}"
    } >>"${log_file}"
  fi
  if [ "${code}" -ne 0 ]; then
    printf '\n[accept] claude exit=%s\n' "${code}" >>"${log_file}"
    return "${code}"
  fi
}

run_claude_session() {
  local workspace="$1"
  local plugin_dir="$2"
  local prompt_file="$3"
  local log_file="$4"
  local timeout_sec="$5"
  _run_claude_session_core "${workspace}" "${plugin_dir}" "${prompt_file}" "${log_file}" "${timeout_sec}"
}

# Project acceptance: marketplace plugins already installed under HOME.
run_claude_session_installed() {
  local workspace="$1"
  local prompt_file="$2"
  local log_file="$3"
  local timeout_sec="$4"
  _run_claude_session_core "${workspace}" "" "${prompt_file}" "${log_file}" "${timeout_sec}"
}

_run_codex_session_core() {
  local workspace="$1"
  local prompt_file="$2"
  local log_file="$3"
  local timeout_sec="$4"
  local model="${DEEPSEEK_MODEL}"

  local prompt
  prompt="$(cat "${prompt_file}")"

  (
    cd "${workspace}"
    timeout "${timeout_sec}" codex exec \
      --skip-git-repo-check \
      --dangerously-bypass-approvals-and-sandbox \
      --dangerously-bypass-hook-trust \
      -m "${model}" \
      -C "${workspace}" \
      "${prompt}"
  ) >"${log_file}" 2>&1 || {
    local code=$?
    printf '\n[accept] codex exit=%s\n' "${code}" >>"${log_file}"
    return "${code}"
  }
}

run_codex_session() {
  local workspace="$1"
  local plugin="$2"
  local marketplace="$3"
  local prompt_file="$4"
  local log_file="$5"
  local timeout_sec="$6"

  install_codex_plugin "${marketplace}" "${plugin}"
  _run_codex_session_core "${workspace}" "${prompt_file}" "${log_file}" "${timeout_sec}"
}

# Project acceptance: full catalog already installed via install-all.sh.
run_codex_session_installed() {
  local workspace="$1"
  local prompt_file="$2"
  local log_file="$3"
  local timeout_sec="$4"
  _run_codex_session_core "${workspace}" "${prompt_file}" "${log_file}" "${timeout_sec}"
}

assert_deepseek_in_log() {
  local log_file="$1"
  local host="$2"
  # Soft check: for codex we see model line; for claude we rely on env
  if [ "${host}" = "codex" ]; then
    if ! grep -Eq "model:[[:space:]]*${DEEPSEEK_MODEL}|deepseek-v4-flash|provider:[[:space:]]*deepseek" "${log_file}"; then
      printf 'Codex log does not show DeepSeek model %s\n' "${DEEPSEEK_MODEL}" >&2
      return 1
    fi
  fi
  if grep -Eiq 'api\.anthropic\.com|openai\.com/v1/responses.*gpt-5' "${log_file}"; then
    # only fail if clearly using non-deepseek without deepseek present
    if ! grep -Eiq 'deepseek' "${log_file}"; then
      printf 'Log suggests non-DeepSeek endpoint without DeepSeek markers\n' >&2
      return 1
    fi
  fi
  return 0
}
