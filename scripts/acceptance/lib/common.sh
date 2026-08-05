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
  find "${cases_dir}" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort
}

read_case_hosts() {
  # Prints space-separated hosts from case.toml hosts = ["claude","codex"]
  local case_dir="$1"
  local toml="${case_dir}/case.toml"
  if [ ! -f "${toml}" ]; then
    echo "claude codex"
    return 0
  fi
  if grep -qE 'hosts\s*=' "${toml}"; then
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
  if [ -f "${toml}" ] && grep -qE 'timeout_sec\s*=' "${toml}"; then
    sed -n 's/.*timeout_sec[[:space:]]*=[[:space:]]*\([0-9][0-9]*\).*/\1/p' "${toml}" | head -1
  else
    echo "${default}"
  fi
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
  mkdir -p "${home_dir}/.claude"
  # Trust all projects under workspace copies (settings)
  cat > "${home_dir}/.claude/settings.json" <<EOF
{
  "hasTrustDialogAccepted": true,
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "${DEEPSEEK_API_KEY}",
    "ANTHROPIC_MODEL": "${model}",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "${model}",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "${model}",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "${model}",
    "CLAUDE_CODE_SUBAGENT_MODEL": "${model}",
    "CLAUDE_CODE_EFFORT_LEVEL": "low"
  },
  "permissions": {
    "defaultMode": "bypassPermissions",
    "allow": ["*"]
  }
}
EOF
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

run_claude_session() {
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
  local force_tools='You are running an automated plugin-acceptance fixture. You MUST attempt the requested file Write/Edit/apply_patch tool call even when the path looks like cache/runtime/log. Do not refuse with policy arguments; the suite measures whether hooks deny the tool. Shell redirection is forbidden when the prompt forbids it.'
  (
    cd "${workspace}"
    timeout "${timeout_sec}" claude -p "${prompt}" \
      --model "${model}" \
      --plugin-dir "${plugin_dir}" \
      --dangerously-skip-permissions \
      --permission-mode bypassPermissions \
      --append-system-prompt "${force_tools}" \
      --output-format text \
      --debug \
      --debug-file "${debug_file}"
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

run_codex_session() {
  local workspace="$1"
  local plugin="$2"
  local marketplace="$3"
  local prompt_file="$4"
  local log_file="$5"
  local timeout_sec="$6"
  local model="${DEEPSEEK_MODEL}"

  install_codex_plugin "${marketplace}" "${plugin}"

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
