#!/usr/bin/env bash
# Install or update the Harness Start marketplace and all plugins
# for Claude Code and/or Codex from the public GitHub repository.
#
# Before installing, lists plugins already installed from this marketplace,
# logs the diff vs the desired catalog, uninstalls previous marketplace
# plugins, then installs the current catalog (remove-then-install).
#
# Also installs/updates community Agent Skills declared by each plugin in
# plugins/<name>/skill-deps.json into the *global* skills scope via:
#   npx skills add <source> --skill <name> --global --yes ...
#
# Public source (only): https://github.com/harness-start/plugins
#
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/harness-start/plugins/master/scripts/install-all.sh | bash
#
# Local clone:
#   bash scripts/install-all.sh
set -euo pipefail

MARKETPLACE_NAME="${HARNESS_MARKETPLACE_NAME:-harness-start}"
MARKETPLACE_SOURCE="${HARNESS_MARKETPLACE_SOURCE:-harness-start/plugins}"
GIT_REF="${HARNESS_GIT_REF:-master}"
GITHUB_HTTPS_URL="https://github.com/harness-start/plugins.git"
MARKETPLACE_JSON_URL_TEMPLATE="https://raw.githubusercontent.com/harness-start/plugins/%s/.claude-plugin/marketplace.json"
SKILL_DEPS_URL_TEMPLATE="https://raw.githubusercontent.com/harness-start/plugins/%s/plugins/%s/skill-deps.json"

# Fallback when network/host list unavailable.
# KEEP IN SYNC with .claude-plugin/marketplace.json plugins[].name
FALLBACK_PLUGINS=(
  research-provenance-guard
  execution-loop-guard
  source-sanity-guard
  git-delivery-guards
  code-quality-guard
  tdd-guard
  encoding-guard
  file-line-budget-guard
  protected-file-guard
  command-safety-guards
  compact-context-journal
  language-output-governance
  subagent-workflow-guard
  intent-clarify-gate
  first-principles-gate
  reasoning-discipline-guard
  goal-task-gate
  markdown-format-guard
  file-access-audit
  command-exec-audit
  subagent-lifecycle-audit
  debugging-workflow-guard
  pptx-project-delivery-guard
  poster-project-delivery-guard
  video-project-delivery-guard
  logo-project-delivery-guard
  print-publication-delivery-guard
  tonejs-music-production
  work-report-insights
  project-capability-governance
)

DO_CLAUDE=1
DO_CODEX=1
DRY_RUN=0
SKIP_MISSING=0
LIST_ONLY=0
FAIL_FAST=0
SKIP_SKILL_DEPS=0
CLAUDE_SCOPE="user"
LANGUAGE_PROFILE="${HARNESS_LANGUAGE_PROFILE:-}"

usage() {
  cat <<'EOF'
Usage: install-all.sh [options]

Add/update the harness-start marketplace and install all catalog plugins
for Claude Code and Codex from GitHub (harness-start/plugins).

Strategy (per host):
  1. Resolve desired plugin names from the marketplace catalog
  2. Detect plugins already installed from this marketplace
  3. Log the diff (remove / keep-in-catalog / add)
  4. Uninstall every previously installed marketplace plugin
  5. Install the current catalog fresh
  6. Install/update community skills declared in each plugin's skill-deps.json
     (global scope via npx skills add … --global)

Options:
  --claude-only           Only Claude Code
  --codex-only            Only Codex
  --ref <ref>             Git ref for Codex marketplace add (default: master)
  --local <path>          Install from a local marketplace checkout (path to repo root)
  --scope <scope>         Claude install scope: user|project|local (default: user)
  --language <profile>    Response profile: zh-CN|zh-TW|en-US|ja-JP|ko-KR|th-TH
                          (default: map the current system locale; fallback: en-US)
  --dry-run               Print actions without running them
  --skip-missing-hosts    Skip missing claude/codex instead of failing
  --skip-skill-deps       Skip community skill install/update from skill-deps.json
  --list-only             Resolve plugin names (and skill deps) and exit
  --fail-fast             Stop on first plugin or skill-deps failure
  -h, --help              Show this help

Environment:
  HARNESS_MARKETPLACE_NAME     default: harness-start
  HARNESS_MARKETPLACE_SOURCE   default: harness-start/plugins
  HARNESS_GIT_REF              default: master
  HARNESS_LANGUAGE_PROFILE     same as --language
  HARNESS_SKIP_SKILL_DEPS      set to 1 to skip skill-deps (same as --skip-skill-deps)
  HARNESS_LOCAL_MARKETPLACE    absolute/relative path; same as --local

Examples:
  curl -fsSL https://raw.githubusercontent.com/harness-start/plugins/master/scripts/install-all.sh | bash
  bash scripts/install-all.sh --claude-only
  bash scripts/install-all.sh --codex-only --ref master
  bash scripts/install-all.sh --language en-US
  bash scripts/install-all.sh --dry-run --skip-missing-hosts
  bash scripts/install-all.sh --skip-skill-deps
EOF
}

# Logs go to stderr so command substitutions only capture data.
log() { printf '==> %s\n' "$*" >&2; }
warn() { printf 'warning: %s\n' "$*" >&2; }
err() { printf 'error: %s\n' "$*" >&2; }

run_cmd() {
  if [ "${DRY_RUN}" = "1" ]; then
    printf '[dry-run]' >&2
    printf ' %q' "$@" >&2
    printf '\n' >&2
    return 0
  fi
  "$@"
}

have_cmd() { command -v "$1" >/dev/null 2>&1; }

resolve_system_language_profile() {
  local system_locale normalized profile
  system_locale="${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}"
  if [ -z "${system_locale}" ] && have_cmd locale; then
    system_locale="$(locale 2>/dev/null | sed -n 's/^LC_MESSAGES=//p' | tr -d '"' | head -n 1)"
  fi
  system_locale="${system_locale:-C}"
  normalized="$(printf '%s' "${system_locale}" | sed 's/[.@].*$//' | tr '[:upper:]_' '[:lower:]-')"

  case "${normalized}" in
    zh-hant*|zh-tw*|zh-hk*|zh-mo*) profile="zh-TW" ;;
    zh*) profile="zh-CN" ;;
    ja*) profile="ja-JP" ;;
    ko*) profile="ko-KR" ;;
    th*) profile="th-TH" ;;
    en*|c|posix) profile="en-US" ;;
    *)
      profile="en-US"
      warn "unsupported system locale ${system_locale}; using ${profile}"
      printf '%s\n' "${profile}"
      return 0
      ;;
  esac

  log "Language: system locale ${system_locale} mapped to ${profile}"
  printf '%s\n' "${profile}"
}

# Read non-empty lines from stdin into a named array variable.
read_lines_into() {
  local __varname="$1"
  local __line
  eval "${__varname}=()"
  while IFS= read -r __line || [ -n "${__line}" ]; do
    [ -n "${__line}" ] || continue
    eval "${__varname}+=(\"\${__line}\")"
  done
}

# Lines in $1 (newline list) that are not in $2 (newline list).
list_minus() {
  local left="$1"
  local right="$2"
  if [ -z "${left}" ]; then
    return 0
  fi
  if [ -z "${right}" ]; then
    printf '%s\n' "${left}"
    return 0
  fi
  comm -23 <(printf '%s\n' "${left}" | sed '/^$/d' | sort -u) \
    <(printf '%s\n' "${right}" | sed '/^$/d' | sort -u)
}

# Lines in both $1 and $2.
list_intersect() {
  local left="$1"
  local right="$2"
  if [ -z "${left}" ] || [ -z "${right}" ]; then
    return 0
  fi
  comm -12 <(printf '%s\n' "${left}" | sed '/^$/d' | sort -u) \
    <(printf '%s\n' "${right}" | sed '/^$/d' | sort -u)
}

format_plugin_list() {
  if [ "$#" -eq 0 ]; then
    printf '<none>'
    return 0
  fi
  printf '%s' "$*"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --claude-only) DO_CLAUDE=1; DO_CODEX=0; shift ;;
    --codex-only) DO_CLAUDE=0; DO_CODEX=1; shift ;;
    --ref)
      GIT_REF="${2:?--ref requires a value}"
      shift 2
      ;;
    --local)
      MARKETPLACE_SOURCE="${2:?--local requires a path}"
      shift 2
      ;;
    --scope)
      CLAUDE_SCOPE="${2:?--scope requires a value}"
      shift 2
      ;;
    --language)
      LANGUAGE_PROFILE="${2:?--language requires a value}"
      shift 2
      ;;
    --dry-run) DRY_RUN=1; shift ;;
    --skip-missing-hosts) SKIP_MISSING=1; shift ;;
    --skip-skill-deps) SKIP_SKILL_DEPS=1; shift ;;
    --list-only) LIST_ONLY=1; shift ;;
    --fail-fast) FAIL_FAST=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      err "unknown option: $1"
      usage >&2
      exit 2
      ;;
  esac
done

if [ -n "${HARNESS_LOCAL_MARKETPLACE:-}" ]; then
  MARKETPLACE_SOURCE="${HARNESS_LOCAL_MARKETPLACE}"
fi

if [ "${HARNESS_SKIP_SKILL_DEPS:-0}" = "1" ]; then
  SKIP_SKILL_DEPS=1
fi

if [ -z "${LANGUAGE_PROFILE}" ]; then
  LANGUAGE_PROFILE="$(resolve_system_language_profile)"
fi

# Local marketplace path: absolute directory containing .claude-plugin/marketplace.json.
# Used by project-level acceptance to install the checkout under test (not GitHub master).
LOCAL_MARKETPLACE_PATH=""
if [ -d "${MARKETPLACE_SOURCE}" ]; then
  LOCAL_MARKETPLACE_PATH="$(cd "${MARKETPLACE_SOURCE}" && pwd)"
  MARKETPLACE_SOURCE="${LOCAL_MARKETPLACE_PATH}"
  if [ ! -f "${LOCAL_MARKETPLACE_PATH}/.claude-plugin/marketplace.json" ]; then
    err "local marketplace missing .claude-plugin/marketplace.json: ${LOCAL_MARKETPLACE_PATH}"
    exit 2
  fi
fi

case "${CLAUDE_SCOPE}" in
  user|project|local) ;;
  *)
    err "--scope must be user, project, or local"
    exit 2
    ;;
esac

case "${LANGUAGE_PROFILE}" in
  zh-CN|zh-TW|en-US|ja-JP|ko-KR|th-TH) ;;
  *)
    err "--language must be zh-CN, zh-TW, en-US, ja-JP, ko-KR, or th-TH"
    exit 2
    ;;
esac

# --- plugin name resolution -------------------------------------------------

fetch_url() {
  local url="$1"
  if have_cmd curl; then
    curl -fsSL --max-time 30 "${url}"
  elif have_cmd wget; then
    wget -qO- --timeout=30 "${url}"
  else
    return 1
  fi
}

parse_marketplace_plugin_names() {
  local json="$1"
  if have_cmd jq; then
    printf '%s' "${json}" | jq -r '.plugins[]?.name // empty' | sed '/^$/d'
    return 0
  fi
  if have_cmd python3; then
    printf '%s' "${json}" | python3 -c '
import json, sys
data = json.load(sys.stdin)
for p in data.get("plugins") or []:
    name = p.get("name")
    if name:
        print(name)
'
    return 0
  fi
  return 1
}

resolve_plugins_from_github() {
  local url
  # shellcheck disable=SC2059
  url="$(printf "${MARKETPLACE_JSON_URL_TEMPLATE}" "${GIT_REF}")"
  local json
  if ! json="$(fetch_url "${url}" 2>/dev/null)"; then
    return 1
  fi
  parse_marketplace_plugin_names "${json}"
}

resolve_plugins_from_local_clone() {
  local script_dir root json
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  root="$(cd "${script_dir}/.." && pwd)"
  if [ ! -f "${root}/.claude-plugin/marketplace.json" ]; then
    return 1
  fi
  json="$(cat "${root}/.claude-plugin/marketplace.json")"
  parse_marketplace_plugin_names "${json}"
}

resolve_plugins_from_claude_available() {
  if ! have_cmd claude || ! have_cmd jq; then
    return 1
  fi
  local raw
  raw="$(claude plugin list --available --json 2>/dev/null || true)"
  [ -n "${raw}" ] || return 1
  printf '%s' "${raw}" | jq -r --arg m "${MARKETPLACE_NAME}" '
    .[]?
    | select((.marketplace // .marketplaceName // "") == $m or (.id // "" | endswith("@" + $m)))
    | (.name // (.id | split("@")[0]) // empty)
  ' | sed '/^$/d' | sort -u
}

resolve_plugins_from_codex_available() {
  if ! have_cmd codex || ! have_cmd jq; then
    return 1
  fi
  local raw
  raw="$(codex plugin list --marketplace "${MARKETPLACE_NAME}" --available --json 2>/dev/null || true)"
  [ -n "${raw}" ] || return 1
  printf '%s' "${raw}" | jq -r '
    if type == "array" then .[]
    elif .plugins then .plugins[]
    elif .available then .available[]
    else empty end
    | (.name // .plugin // .id // empty)
    | if type == "string" and contains("@") then split("@")[0] else . end
  ' | sed '/^$/d' | sort -u
}

resolve_plugins_from_marketplace_path() {
  local root="$1"
  local json
  if [ ! -f "${root}/.claude-plugin/marketplace.json" ]; then
    return 1
  fi
  json="$(cat "${root}/.claude-plugin/marketplace.json")"
  parse_marketplace_plugin_names "${json}"
}

resolve_plugin_names() {
  local names=""

  # Prefer the local checkout catalog when installing from a path (project acceptance).
  if [ -n "${LOCAL_MARKETPLACE_PATH}" ]; then
    if names="$(resolve_plugins_from_marketplace_path "${LOCAL_MARKETPLACE_PATH}" 2>/dev/null)" && [ -n "${names}" ]; then
      log "Plugin list from local marketplace ${LOCAL_MARKETPLACE_PATH}"
    else
      err "Failed to resolve plugins from local marketplace ${LOCAL_MARKETPLACE_PATH}"
      return 1
    fi
  elif names="$(resolve_plugins_from_github 2>/dev/null)" && [ -n "${names}" ]; then
    log "Plugin list from GitHub marketplace.json (ref=${GIT_REF})"
  elif names="$(resolve_plugins_from_local_clone 2>/dev/null)" && [ -n "${names}" ]; then
    log "Plugin list from local .claude-plugin/marketplace.json"
  elif names="$(resolve_plugins_from_claude_available 2>/dev/null)" && [ -n "${names}" ]; then
    log "Plugin list from Claude available plugins"
  elif names="$(resolve_plugins_from_codex_available 2>/dev/null)" && [ -n "${names}" ]; then
    log "Plugin list from Codex available plugins"
  else
    warn "Using embedded fallback plugin list (KEEP IN SYNC with marketplace.json)"
    names="$(printf '%s\n' "${FALLBACK_PLUGINS[@]}")"
  fi

  # Unique, non-empty
  printf '%s\n' "${names}" | sed '/^$/d' | sort -u
}

# --- installed plugin discovery ---------------------------------------------

# Print plugin names currently installed from MARKETPLACE_NAME (Claude).
list_claude_installed_marketplace_plugins() {
  if ! have_cmd claude; then
    return 0
  fi
  local raw
  raw="$(claude plugin list --json 2>/dev/null || true)"
  [ -n "${raw}" ] || return 0

  if have_cmd jq; then
    printf '%s' "${raw}" | jq -r --arg m "${MARKETPLACE_NAME}" '
      if type == "array" then .[]
      elif .plugins then .plugins[]
      elif .installed then .installed[]
      else empty end
      | select(
          (.marketplace // .marketplaceName // "") == $m
          or (.id // .pluginId // "" | endswith("@" + $m))
        )
      | (.name // ((.id // .pluginId // "") | split("@")[0]) // empty)
    ' | sed '/^$/d' | sort -u
    return 0
  fi

  # Best-effort without jq: selector strings like name@marketplace
  printf '%s' "${raw}" \
    | grep -oE "[A-Za-z0-9._-]+@${MARKETPLACE_NAME}" \
    | sed "s/@${MARKETPLACE_NAME}\$//" \
    | sort -u
}

# Print plugin names currently installed from MARKETPLACE_NAME (Codex).
list_codex_installed_marketplace_plugins() {
  if ! have_cmd codex; then
    return 0
  fi
  local raw
  raw="$(codex plugin list --marketplace "${MARKETPLACE_NAME}" --json 2>/dev/null || true)"
  if [ -z "${raw}" ]; then
    raw="$(codex plugin list --json 2>/dev/null || true)"
  fi
  [ -n "${raw}" ] || return 0

  if have_cmd jq; then
    # Prefer .installed when present. Marketplace-scoped lists may omit
    # marketplace fields; default missing marketplace to $m so scoped rows match.
    printf '%s' "${raw}" | jq -r --arg m "${MARKETPLACE_NAME}" '
      if type == "object" and (.installed | type == "array") then .installed[]
      elif type == "array" then .[]
      elif .plugins then .plugins[]
      else empty end
      | select(.installed != false)
      | select(
          (.marketplaceName // .marketplace // $m) == $m
          or (.pluginId // .id // "" | endswith("@" + $m))
        )
      | (.name // ((.pluginId // .id // "") | split("@")[0]) // empty)
    ' | sed '/^$/d' | sort -u
    return 0
  fi

  printf '%s' "${raw}" \
    | grep -oE "[A-Za-z0-9._-]+@${MARKETPLACE_NAME}" \
    | sed "s/@${MARKETPLACE_NAME}\$//" \
    | sort -u
}

# Log installed vs desired and populate remove/keep/add newline lists via namerefs.
# Usage: plan_plugin_diff <host_label> <installed_lines> <desired_lines>
# Prints: remove\tkeep\tadd as three sections via globals PLAN_REMOVE / PLAN_KEEP / PLAN_ADD
plan_plugin_diff() {
  local host_label="$1"
  local installed_lines="$2"
  local desired_lines="$3"

  PLAN_REMOVE="$(list_minus "${installed_lines}" "${desired_lines}" || true)"
  PLAN_KEEP="$(list_intersect "${installed_lines}" "${desired_lines}" || true)"
  PLAN_ADD="$(list_minus "${desired_lines}" "${installed_lines}" || true)"

  local -a installed_arr=() remove_arr=() keep_arr=() add_arr=() desired_arr=()
  read_lines_into installed_arr <<<"${installed_lines}"
  read_lines_into desired_arr <<<"${desired_lines}"
  read_lines_into remove_arr <<<"${PLAN_REMOVE}"
  read_lines_into keep_arr <<<"${PLAN_KEEP}"
  read_lines_into add_arr <<<"${PLAN_ADD}"

  log "${host_label}: installed now (${#installed_arr[@]}): $(format_plugin_list "${installed_arr[@]}")"
  log "${host_label}: desired catalog (${#desired_arr[@]}): $(format_plugin_list "${desired_arr[@]}")"
  log "${host_label}: will remove (${#remove_arr[@]}): $(format_plugin_list "${remove_arr[@]}")"
  log "${host_label}: will reinstall (already present) (${#keep_arr[@]}): $(format_plugin_list "${keep_arr[@]}")"
  log "${host_label}: will install (new) (${#add_arr[@]}): $(format_plugin_list "${add_arr[@]}")"
}

# --- Claude ------------------------------------------------------------------

claude_marketplace_present() {
  have_cmd claude || return 1
  local raw
  raw="$(claude plugin marketplace list --json 2>/dev/null || true)"
  [ -n "${raw}" ] || return 1
  if have_cmd jq; then
    printf '%s' "${raw}" | jq -e --arg n "${MARKETPLACE_NAME}" '
      [.[]? | select(.name == $n)] | length > 0
    ' >/dev/null 2>&1
  else
    printf '%s' "${raw}" | grep -q "\"name\"[[:space:]]*:[[:space:]]*\"${MARKETPLACE_NAME}\""
  fi
}

ensure_claude_marketplace() {
  if [ -n "${LOCAL_MARKETPLACE_PATH}" ]; then
    # Local path: always re-add so the checkout under test is the source of truth.
    log "Claude: adding local marketplace ${LOCAL_MARKETPLACE_PATH}"
    run_cmd claude plugin marketplace add "${LOCAL_MARKETPLACE_PATH}" || \
      run_cmd claude plugin marketplace update "${MARKETPLACE_NAME}" || true
    return 0
  fi
  if claude_marketplace_present; then
    log "Claude: updating marketplace ${MARKETPLACE_NAME}"
    run_cmd claude plugin marketplace update "${MARKETPLACE_NAME}"
  else
    log "Claude: adding marketplace ${MARKETPLACE_SOURCE}"
    if ! run_cmd claude plugin marketplace add "${MARKETPLACE_SOURCE}"; then
      warn "Claude marketplace add via ${MARKETPLACE_SOURCE} failed; trying ${GITHUB_HTTPS_URL}"
      run_cmd claude plugin marketplace add "${GITHUB_HTTPS_URL}"
    fi
  fi
}

uninstall_claude_plugin() {
  local plugin="$1"
  local selector="${plugin}@${MARKETPLACE_NAME}"
  log "Claude: uninstall ${selector}"
  # -y: non-interactive; scope matches install scope
  if ! run_cmd claude plugin uninstall "${selector}" -s "${CLAUDE_SCOPE}" -y; then
    # Older CLIs may lack -y or use remove alias
    if ! run_cmd claude plugin remove "${selector}" -s "${CLAUDE_SCOPE}" -y 2>/dev/null; then
      if ! run_cmd claude plugin uninstall "${selector}" -s "${CLAUDE_SCOPE}"; then
        warn "Claude uninstall failed for ${selector} (continuing)"
        return 1
      fi
    fi
  fi
  return 0
}

install_claude_plugin() {
  local plugin="$1"
  local selector="${plugin}@${MARKETPLACE_NAME}"
  log "Claude: install ${selector}"
  if ! run_cmd claude plugin install "${selector}" -s "${CLAUDE_SCOPE}"; then
    err "Claude failed: ${selector}"
    return 1
  fi
  return 0
}

# Remove-then-install all marketplace plugins for Claude.
sync_claude_plugins() {
  local -a desired=("$@")
  local failures=0
  local plugin
  local installed_lines desired_lines

  desired_lines="$(printf '%s\n' "${desired[@]}")"
  installed_lines="$(list_claude_installed_marketplace_plugins || true)"

  plan_plugin_diff "Claude" "${installed_lines}" "${desired_lines}"

  # 1) Uninstall every previously installed plugin from this marketplace
  local -a installed_arr=()
  read_lines_into installed_arr <<<"${installed_lines}"
  if [ "${#installed_arr[@]}" -gt 0 ]; then
    log "Claude: uninstalling ${#installed_arr[@]} previously installed marketplace plugin(s)"
    for plugin in "${installed_arr[@]}"; do
      set +e
      uninstall_claude_plugin "${plugin}"
      local rc=$?
      set -e
      if [ "${rc}" -ne 0 ]; then
        failures=$((failures + 1))
        [ "${FAIL_FAST}" = "1" ] && return 1
      fi
    done
  else
    log "Claude: no previously installed marketplace plugins"
  fi

  # 2) Install current catalog
  log "Claude: installing ${#desired[@]} catalog plugin(s)"
  for plugin in "${desired[@]}"; do
    set +e
    install_claude_plugin "${plugin}"
    local rc=$?
    set -e
    if [ "${rc}" -ne 0 ]; then
      failures=$((failures + 1))
      [ "${FAIL_FAST}" = "1" ] && return 1
    fi
  done

  return "${failures}"
}

# --- Codex -------------------------------------------------------------------

codex_marketplace_present() {
  have_cmd codex || return 1
  local raw
  raw="$(codex plugin marketplace list --json 2>/dev/null || true)"
  [ -n "${raw}" ] || return 1
  if have_cmd jq; then
    printf '%s' "${raw}" | jq -e --arg n "${MARKETPLACE_NAME}" '
      (if type == "array" then . else (.marketplaces // []) end)
      | [.[]? | select(.name == $n)] | length > 0
    ' >/dev/null 2>&1
  else
    printf '%s' "${raw}" | grep -q "\"name\"[[:space:]]*:[[:space:]]*\"${MARKETPLACE_NAME}\""
  fi
}

ensure_codex_marketplace() {
  if [ -n "${LOCAL_MARKETPLACE_PATH}" ]; then
    # Local path has no git ref; match host-acceptance local marketplace add.
    log "Codex: adding local marketplace ${LOCAL_MARKETPLACE_PATH}"
    run_cmd codex plugin marketplace add "${LOCAL_MARKETPLACE_PATH}" --json || \
      run_cmd codex plugin marketplace add "${LOCAL_MARKETPLACE_PATH}" || true
    return 0
  fi
  if codex_marketplace_present; then
    log "Codex: upgrading marketplace ${MARKETPLACE_NAME}"
    run_cmd codex plugin marketplace upgrade "${MARKETPLACE_NAME}" --json
  else
    log "Codex: adding marketplace ${MARKETPLACE_SOURCE} --ref ${GIT_REF}"
    if ! run_cmd codex plugin marketplace add "${MARKETPLACE_SOURCE}" --ref "${GIT_REF}" --json; then
      warn "Codex marketplace add via ${MARKETPLACE_SOURCE} failed; trying ${GITHUB_HTTPS_URL}"
      run_cmd codex plugin marketplace add "${GITHUB_HTTPS_URL}" --ref "${GIT_REF}" --json
    fi
  fi
}

uninstall_codex_plugin() {
  local plugin="$1"
  local selector="${plugin}@${MARKETPLACE_NAME}"
  log "Codex: remove ${selector}"
  if ! run_cmd codex plugin remove "${selector}" --json; then
    if ! run_cmd codex plugin remove "${plugin}" --marketplace "${MARKETPLACE_NAME}" --json; then
      warn "Codex remove failed for ${selector} (continuing)"
      return 1
    fi
  fi
  return 0
}

install_codex_plugin() {
  local plugin="$1"
  local selector="${plugin}@${MARKETPLACE_NAME}"
  log "Codex: add ${selector}"
  if ! run_cmd codex plugin add "${selector}" --json; then
    warn "Codex add failed for ${selector}; retrying once"
    if ! run_cmd codex plugin add "${selector}" --json; then
      err "Codex failed: ${selector}"
      return 1
    fi
  fi
  return 0
}

# Remove-then-install all marketplace plugins for Codex.
sync_codex_plugins() {
  local -a desired=("$@")
  local failures=0
  local plugin
  local installed_lines desired_lines

  desired_lines="$(printf '%s\n' "${desired[@]}")"
  installed_lines="$(list_codex_installed_marketplace_plugins || true)"

  plan_plugin_diff "Codex" "${installed_lines}" "${desired_lines}"

  local -a installed_arr=()
  read_lines_into installed_arr <<<"${installed_lines}"
  if [ "${#installed_arr[@]}" -gt 0 ]; then
    log "Codex: removing ${#installed_arr[@]} previously installed marketplace plugin(s)"
    for plugin in "${installed_arr[@]}"; do
      set +e
      uninstall_codex_plugin "${plugin}"
      local rc=$?
      set -e
      if [ "${rc}" -ne 0 ]; then
        failures=$((failures + 1))
        [ "${FAIL_FAST}" = "1" ] && return 1
      fi
    done
  else
    log "Codex: no previously installed marketplace plugins"
  fi

  log "Codex: adding ${#desired[@]} catalog plugin(s)"
  for plugin in "${desired[@]}"; do
    set +e
    install_codex_plugin "${plugin}"
    local rc=$?
    set -e
    if [ "${rc}" -ne 0 ]; then
      failures=$((failures + 1))
      [ "${FAIL_FAST}" = "1" ] && return 1
    fi
  done

  return "${failures}"
}

# --- language profile --------------------------------------------------------

write_language_profile() {
  local host="$1"
  local config_root path
  [ -n "${LANGUAGE_PROFILE}" ] || return 0

  case "${host}" in
    claude) config_root="${CLAUDE_CONFIG_DIR:-$HOME/.claude}" ;;
    codex) config_root="${CODEX_HOME:-$HOME/.codex}" ;;
    *) err "unsupported language profile host: ${host}"; return 1 ;;
  esac
  path="${config_root}/harness-start/language-output-governance.json"

  if [ "${DRY_RUN}" = "1" ]; then
    log "${host}: would set language profile ${LANGUAGE_PROFILE} in ${path}"
    return 0
  fi

  local temp_path="${path}.tmp.$$"
  umask 077
  mkdir -p -- "$(dirname "${path}")"
  printf '{\n  "defaultProfile": "%s"\n}\n' "${LANGUAGE_PROFILE}" >"${temp_path}"
  mv -- "${temp_path}" "${path}"
  log "${host}: language profile ${LANGUAGE_PROFILE} saved to ${path}"
}

# --- community skill deps (skill-deps.json) ----------------------------------
#
# Each plugin may declare community skills at:
#   plugins/<name>/skill-deps.json
#
# Schema:
#   {
#     "skills": [
#       {
#         "name": "grill-me",
#         "source": "https://github.com/mattpocock/skills",
#         "description": "optional human note"
#       }
#     ]
#   }
#
# Install target is always *global* user scope:
#   npx --yes skills add <source> --skill <name> --global --yes -a <agents...>
#
# Re-running add updates/overwrites an existing global install.

local_repo_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "${script_dir}/.." && pwd
}

# Parse skill-deps JSON → stdout lines: name<TAB>source
# Returns 0 when JSON is valid (including empty skills). Returns 1 on parse error.
parse_skill_deps_json() {
  local json="$1"
  local plugin_label="${2:-skill-deps.json}"

  if [ -z "${json}" ]; then
    return 0
  fi

  if have_cmd jq; then
    if ! printf '%s' "${json}" | jq -e 'type == "object"' >/dev/null 2>&1; then
      err "${plugin_label}: root must be a JSON object"
      return 1
    fi
    if ! printf '%s' "${json}" | jq -e 'has("skills")' >/dev/null 2>&1; then
      err "${plugin_label}: missing required \"skills\" array"
      return 1
    fi
    if ! printf '%s' "${json}" | jq -e '.skills | type == "array"' >/dev/null 2>&1; then
      err "${plugin_label}: \"skills\" must be an array"
      return 1
    fi
    # Reject entries missing name/source; emit valid pairs.
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
          )
        | "\(.key)"
      '
    )"
    if [ -n "${bad}" ]; then
      err "${plugin_label}: each skills[] entry needs non-empty string name and source"
      return 1
    fi
    printf '%s' "${json}" | jq -r '
      .skills[]?
      | select((.name | type == "string") and (.name | length > 0)
               and (.source | type == "string") and (.source | length > 0))
      | "\(.name)\t\(.source)"
    '
    return 0
  fi

  if have_cmd python3; then
    printf '%s' "${json}" | python3 -c '
import json, sys
label = sys.argv[1]
try:
    data = json.load(sys.stdin)
except Exception as e:
    print(f"error: {label}: invalid JSON: {e}", file=sys.stderr)
    sys.exit(1)
if not isinstance(data, dict):
    print(f"error: {label}: root must be a JSON object", file=sys.stderr)
    sys.exit(1)
skills = data.get("skills")
if skills is None:
    print(f"error: {label}: missing required \"skills\" array", file=sys.stderr)
    sys.exit(1)
if not isinstance(skills, list):
    print(f"error: {label}: \"skills\" must be an array", file=sys.stderr)
    sys.exit(1)
for i, item in enumerate(skills):
    if not isinstance(item, dict):
        print(f"error: {label}: skills[{i}] must be an object", file=sys.stderr)
        sys.exit(1)
    name = item.get("name")
    source = item.get("source")
    if not isinstance(name, str) or not name.strip():
        print(f"error: {label}: skills[{i}].name must be a non-empty string", file=sys.stderr)
        sys.exit(1)
    if not isinstance(source, str) or not source.strip():
        print(f"error: {label}: skills[{i}].source must be a non-empty string", file=sys.stderr)
        sys.exit(1)
    print(f"{name.strip()}\t{source.strip()}")
' "${plugin_label}"
    return $?
  fi

  err "need jq or python3 to parse skill-deps.json"
  return 1
}

# Load skill-deps for one plugin name. Prefer local marketplace / clone, else GitHub raw.
# Emits name<TAB>source lines to stdout. Missing file is not an error.
load_skill_deps_for_plugin() {
  local plugin="$1"
  local root json url label

  root="${LOCAL_MARKETPLACE_PATH:-$(local_repo_root)}"
  label="plugins/${plugin}/skill-deps.json"

  if [ -f "${root}/plugins/${plugin}/skill-deps.json" ]; then
    json="$(cat "${root}/plugins/${plugin}/skill-deps.json")"
    parse_skill_deps_json "${json}" "${label}"
    return $?
  fi

  if [ -n "${LOCAL_MARKETPLACE_PATH}" ]; then
    # Local install: absence means no community deps for this plugin.
    return 0
  fi

  # shellcheck disable=SC2059
  url="$(printf "${SKILL_DEPS_URL_TEMPLATE}" "${GIT_REF}" "${plugin}")"
  if json="$(fetch_url "${url}" 2>/dev/null)"; then
    parse_skill_deps_json "${json}" "${label} (ref=${GIT_REF})"
    return $?
  fi

  # No skill-deps for this plugin — fine.
  return 0
}

# Collect unique skill deps for the given plugin names.
# Prints name<TAB>source, deduped by skill name (first source wins).
# Sets global SKILL_DEPS_PARSE_FAIL to non-zero when any manifest is invalid.
collect_skill_deps() {
  local -a plugins=("$@")
  local plugin lines line name source
  local -A seen_names=()
  local -A seen_pairs=()
  SKILL_DEPS_PARSE_FAIL=0

  for plugin in "${plugins[@]}"; do
    [ -n "${plugin}" ] || continue
    set +e
    lines="$(load_skill_deps_for_plugin "${plugin}")"
    local rc=$?
    set -e
    if [ "${rc}" -ne 0 ]; then
      SKILL_DEPS_PARSE_FAIL=$((SKILL_DEPS_PARSE_FAIL + 1))
      warn "Invalid skill-deps for plugin ${plugin}"
      [ "${FAIL_FAST}" = "1" ] && return 1
      continue
    fi
    [ -n "${lines}" ] || continue
    while IFS= read -r line || [ -n "${line}" ]; do
      [ -n "${line}" ] || continue
      name="${line%%$'\t'*}"
      source="${line#*$'\t'}"
      if [ -z "${name}" ] || [ -z "${source}" ] || [ "${name}" = "${line}" ]; then
        warn "Skipping malformed skill-deps line from ${plugin}: ${line}"
        continue
      fi
      if [ -n "${seen_names[${name}]+x}" ]; then
        if [ "${seen_names[${name}]}" != "${source}" ]; then
          warn "Skill ${name} declared with different sources; keeping ${seen_names[${name}]} (ignoring ${source} from ${plugin})"
        fi
        continue
      fi
      seen_names["${name}"]="${source}"
      seen_pairs["${name}"]="${source}"
      printf '%s\t%s\n' "${name}" "${source}"
    done <<<"${lines}"
  done
  return 0
}

# Agents for skills CLI based on which hosts this install targets.
skill_install_agents() {
  local -a agents=()
  if [ "${DO_CLAUDE}" = "1" ]; then
    agents+=(claude-code)
  fi
  if [ "${DO_CODEX}" = "1" ]; then
    agents+=(codex)
  fi
  # Fallback if both host flags somehow off: still install for dual-host.
  if [ "${#agents[@]}" -eq 0 ]; then
    agents=(claude-code codex)
  fi
  printf '%s\n' "${agents[@]}"
}

# Install or update one community skill into the global skills scope.
install_global_skill() {
  local name="$1"
  local source="$2"
  local -a agents=()
  local -a agent_args=()
  local agent

  read_lines_into agents < <(skill_install_agents)
  for agent in "${agents[@]}"; do
    agent_args+=(-a "${agent}")
  done

  log "Skills: install/update global ${name} from ${source} (agents: ${agents[*]})"
  # Always re-run add: updates/overwrites existing global install; works even when
  # the skill was previously copied outside the skills CLI lockfile.
  if ! run_cmd npx --yes skills add "${source}" --skill "${name}" --global --yes "${agent_args[@]}"; then
    err "Failed to install global skill ${name} from ${source}"
    return 1
  fi
  return 0
}

# Install all collected skill deps. Returns number of failures.
sync_skill_deps() {
  local -a plugins=("$@")
  local failures=0
  local deps_lines line name source
  local -a dep_arr=()

  if [ "${SKIP_SKILL_DEPS}" = "1" ]; then
    log "Skills: skipped (--skip-skill-deps / HARNESS_SKIP_SKILL_DEPS=1)"
    return 0
  fi

  if ! have_cmd npx; then
    # Collect first so we only warn when deps actually exist.
    deps_lines="$(collect_skill_deps "${plugins[@]}" || true)"
    if [ -n "${deps_lines}" ] || [ "${SKILL_DEPS_PARSE_FAIL:-0}" -gt 0 ]; then
      if [ "${SKIP_MISSING}" = "1" ]; then
        warn "npx not found; skipping community skill-deps install"
        return 0
      fi
      err "npx not found on PATH (need Node.js to install skill-deps; or pass --skip-skill-deps / --skip-missing-hosts)"
      return 1
    fi
    log "Skills: no skill-deps declared; npx not required"
    return 0
  fi

  set +e
  deps_lines="$(collect_skill_deps "${plugins[@]}")"
  local collect_rc=$?
  set -e
  if [ "${collect_rc}" -ne 0 ] && [ "${FAIL_FAST}" = "1" ]; then
    return 1
  fi

  if [ "${SKILL_DEPS_PARSE_FAIL:-0}" -gt 0 ]; then
    failures=$((failures + SKILL_DEPS_PARSE_FAIL))
    if [ "${FAIL_FAST}" = "1" ]; then
      return "${failures}"
    fi
  fi

  if [ -z "${deps_lines}" ]; then
    log "Skills: no community skill-deps declared by catalog plugins"
    return "${failures}"
  fi

  read_lines_into dep_arr <<<"${deps_lines}"
  log "Skills: ${#dep_arr[@]} unique community skill(s) to install/update globally"

  for line in "${dep_arr[@]}"; do
    name="${line%%$'\t'*}"
    source="${line#*$'\t'}"
    set +e
    install_global_skill "${name}" "${source}"
    local rc=$?
    set -e
    if [ "${rc}" -ne 0 ]; then
      failures=$((failures + 1))
      [ "${FAIL_FAST}" = "1" ] && return "${failures}"
    fi
  done

  return "${failures}"
}

# --- main --------------------------------------------------------------------

main() {
  log "Harness Start installer"
  if [ -n "${LOCAL_MARKETPLACE_PATH}" ]; then
    log "Local marketplace: ${LOCAL_MARKETPLACE_PATH}"
  else
    log "Public source: https://github.com/harness-start/plugins (ref=${GIT_REF})"
  fi
  log "Marketplace: ${MARKETPLACE_NAME}"
  log "Mode: detect installed marketplace plugins → remove → install catalog → skill-deps"

  load_plugins_array() {
    PLUGINS=()
    local line
    while IFS= read -r line || [ -n "${line}" ]; do
      [ -n "${line}" ] || continue
      PLUGINS+=("${line}")
    done <<EOF
$(resolve_plugin_names)
EOF
  }

  load_plugins_array
  if [ "${#PLUGINS[@]}" -eq 0 ]; then
    err "No plugins resolved"
    exit 1
  fi

  log "Plugins (${#PLUGINS[@]}): ${PLUGINS[*]}"

  if [ "${LIST_ONLY}" = "1" ]; then
    printf '%s\n' "${PLUGINS[@]}"
    if [ "${SKIP_SKILL_DEPS}" != "1" ]; then
      local deps_lines
      deps_lines="$(collect_skill_deps "${PLUGINS[@]}" || true)"
      if [ -n "${deps_lines}" ]; then
        printf '\n# skill-deps (name<TAB>source)\n' >&2
        printf '%s\n' "${deps_lines}"
      fi
      if [ "${SKILL_DEPS_PARSE_FAIL:-0}" -gt 0 ]; then
        err "${SKILL_DEPS_PARSE_FAIL} skill-deps manifest(s) failed to parse"
        exit 1
      fi
    fi
    exit 0
  fi

  local claude_fail=0 codex_fail=0 skill_fail=0 did_any=0

  if [ "${DO_CLAUDE}" = "1" ]; then
    if have_cmd claude; then
      did_any=1
      ensure_claude_marketplace
      # Re-resolve after marketplace is present (may pick host available list)
      load_plugins_array
      set +e
      sync_claude_plugins "${PLUGINS[@]}"
      claude_fail=$?
      set -e
      if [ "${claude_fail}" -eq 0 ]; then
        write_language_profile claude
      fi
    else
      if [ "${SKIP_MISSING}" = "1" ]; then
        warn "claude not found; skipping Claude Code"
      else
        err "claude not found on PATH (install Claude Code CLI, or pass --skip-missing-hosts / --codex-only)"
        exit 1
      fi
    fi
  fi

  if [ "${DO_CODEX}" = "1" ]; then
    if have_cmd codex; then
      did_any=1
      ensure_codex_marketplace
      load_plugins_array
      set +e
      sync_codex_plugins "${PLUGINS[@]}"
      codex_fail=$?
      set -e
      if [ "${codex_fail}" -eq 0 ]; then
        write_language_profile codex
      fi
    else
      if [ "${SKIP_MISSING}" = "1" ]; then
        warn "codex not found; skipping Codex"
      else
        err "codex not found on PATH (install Codex CLI, or pass --skip-missing-hosts / --claude-only)"
        exit 1
      fi
    fi
  fi

  # Community skills are host-independent (global user scope). Run even when
  # host CLIs are missing (e.g. --skip-missing-hosts) so skill-deps still apply.
  set +e
  sync_skill_deps "${PLUGINS[@]}"
  skill_fail=$?
  set -e
  if [ "${SKIP_SKILL_DEPS}" != "1" ]; then
    did_any=1
  fi

  if [ "${did_any}" = "0" ]; then
    err "No host CLIs ran (claude/codex missing?) and skill-deps were skipped"
    exit 1
  fi

  printf '\n'
  log "Done"
  if [ "${DO_CLAUDE}" = "1" ] && have_cmd claude; then
    printf '  Claude: start a new session (or /reload-plugins if prompted) so hooks load.\n'
  fi
  if [ "${DO_CODEX}" = "1" ] && have_cmd codex; then
    printf '  Codex: review and trust plugin hooks with /hooks before they run.\n'
    printf '         Install success does not mean hooks are trusted or executing.\n'
  fi
  if [ "${SKIP_SKILL_DEPS}" != "1" ]; then
    printf '  Skills: community skill-deps install to global scope (~/.agents/skills via npx skills).\n'
  fi

  local total_fail=$((claude_fail + codex_fail + skill_fail))
  if [ "${total_fail}" -gt 0 ]; then
    err "${total_fail} plugin/skill operation(s) failed"
    exit 1
  fi
}

main
