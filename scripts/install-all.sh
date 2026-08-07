#!/usr/bin/env bash
# Install or update the Harness Start marketplace and all plugins
# for Claude Code and/or Codex from the public GitHub repository.
#
# Before installing, lists plugins already installed from this marketplace,
# logs the diff vs the desired catalog, uninstalls previous marketplace
# plugins, then installs the current catalog (remove-then-install).
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

# Fallback when network/host list unavailable.
# KEEP IN SYNC with .claude-plugin/marketplace.json plugins[].name
FALLBACK_PLUGINS=(
  verification-provenance-guard
  execution-loop-guard
  source-sanity-guard
  code-quality-guard
  encoding-guard
  file-line-budget-guard
  protected-file-guard
  command-safety-guards
  language-output-governance
  subagent-discipline
  intent-clarify-gate
)

DO_CLAUDE=1
DO_CODEX=1
DRY_RUN=0
SKIP_MISSING=0
LIST_ONLY=0
FAIL_FAST=0
CLAUDE_SCOPE="user"

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

Options:
  --claude-only           Only Claude Code
  --codex-only            Only Codex
  --ref <ref>             Git ref for Codex marketplace add (default: master)
  --scope <scope>         Claude install scope: user|project|local (default: user)
  --dry-run               Print actions without running them
  --skip-missing-hosts    Skip missing claude/codex instead of failing
  --list-only             Resolve plugin names and exit
  --fail-fast             Stop on first plugin failure
  -h, --help              Show this help

Environment:
  HARNESS_MARKETPLACE_NAME     default: harness-start
  HARNESS_MARKETPLACE_SOURCE   default: harness-start/plugins
  HARNESS_GIT_REF              default: master

Examples:
  curl -fsSL https://raw.githubusercontent.com/harness-start/plugins/master/scripts/install-all.sh | bash
  bash scripts/install-all.sh --claude-only
  bash scripts/install-all.sh --codex-only --ref master
  bash scripts/install-all.sh --dry-run --skip-missing-hosts
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
    --scope)
      CLAUDE_SCOPE="${2:?--scope requires a value}"
      shift 2
      ;;
    --dry-run) DRY_RUN=1; shift ;;
    --skip-missing-hosts) SKIP_MISSING=1; shift ;;
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

case "${CLAUDE_SCOPE}" in
  user|project|local) ;;
  *)
    err "--scope must be user, project, or local"
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

resolve_plugin_names() {
  local names=""

  if names="$(resolve_plugins_from_github 2>/dev/null)" && [ -n "${names}" ]; then
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

# --- main --------------------------------------------------------------------

main() {
  log "Harness Start installer"
  log "Public source: https://github.com/harness-start/plugins (ref=${GIT_REF})"
  log "Marketplace: ${MARKETPLACE_NAME}"
  log "Mode: detect installed marketplace plugins → remove → install catalog"

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
    exit 0
  fi

  local claude_fail=0 codex_fail=0 did_any=0

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
    else
      if [ "${SKIP_MISSING}" = "1" ]; then
        warn "codex not found; skipping Codex"
      else
        err "codex not found on PATH (install Codex CLI, or pass --skip-missing-hosts / --claude-only)"
        exit 1
      fi
    fi
  fi

  if [ "${did_any}" = "0" ]; then
    err "No host CLIs ran (claude/codex missing?)"
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

  local total_fail=$((claude_fail + codex_fail))
  if [ "${total_fail}" -gt 0 ]; then
    err "${total_fail} plugin operation(s) failed"
    exit 1
  fi
}

main
