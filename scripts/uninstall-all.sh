#!/usr/bin/env bash
# Uninstall every Harness Start plugin, remove its marketplace, and clean the
# host preference written by scripts/install-all.sh.
set -euo pipefail

MARKETPLACE_NAME="${HARNESS_MARKETPLACE_NAME:-harness-start}"
DO_CLAUDE=1
DO_CODEX=1
DRY_RUN=0
CLAUDE_SCOPE="user"
FAILURES=0
HOSTS_FOUND=0

usage() {
  printf '%s\n' \
    "Usage: uninstall-all.sh [options]" \
    "" \
    "Uninstall all plugins from the harness-start marketplace, remove the" \
    "marketplace, and delete the host preference written by install-all.sh." \
    "" \
    "Options:" \
    "  --claude-only       Only Claude Code" \
    "  --codex-only        Only Codex" \
    "  --scope <scope>     Claude scope: user|project|local (default: user)" \
    "  --dry-run           Print destructive commands without running them" \
    "  -h, --help          Show this help"
}

log() { printf '==> %s\n' "$*" >&2; }
warn() { printf 'warning: %s\n' "$*" >&2; }
err() { printf 'error: %s\n' "$*" >&2; }
have_cmd() { command -v "$1" >/dev/null 2>&1; }

run_cmd() {
  if [ "${DRY_RUN}" = "1" ]; then
    printf '[dry-run]' >&2
    printf ' %q' "$@" >&2
    printf '\n' >&2
    return 0
  fi
  "$@"
}

plugin_name_is_safe() {
  local name="$1"
  [ -n "${name}" ] || return 1
  [ "${name}" != "." ] && [ "${name}" != ".." ] || return 1
  [[ "${name}" =~ ^[A-Za-z0-9._-]+$ ]]
}

marketplace_state() {
  local json="$1"
  printf '%s' "${json}" | jq -r --arg marketplace "${MARKETPLACE_NAME}" '
    [
      if type == "array" then .[]
      elif .marketplaces then .marketplaces[]
      else empty end
      | select(.name == $marketplace)
    ]
    | if length > 0 then "present" else "absent" end
  '
}

claude_plugin_names() {
  jq -r --arg marketplace "${MARKETPLACE_NAME}" --arg scope "${CLAUDE_SCOPE}" '
    if type == "array" then .[]
    elif .plugins then .plugins[]
    elif .installed then .installed[]
    else empty end
    | select((.scope // $scope) == $scope)
    | select(
        (.marketplace // .marketplaceName // "") == $marketplace
        or (.id // .pluginId // "" | endswith("@" + $marketplace))
      )
    | (.name // ((.id // .pluginId // "") | split("@")[0]) // empty)
  ' | sed '/^$/d' | sort -u
}

codex_plugin_names() {
  jq -r --arg marketplace "${MARKETPLACE_NAME}" '
    if type == "object" and (.installed | type == "array") then .installed[]
    elif type == "array" then .[]
    elif .plugins then .plugins[]
    else empty end
    | select(.installed != false)
    | select(
        (.marketplaceName // .marketplace // $marketplace) == $marketplace
        or (.pluginId // .id // "" | endswith("@" + $marketplace))
      )
    | (.name // ((.pluginId // .id // "") | split("@")[0]) // empty)
  ' | sed '/^$/d' | sort -u
}

cleanup_preference() {
  local host="$1"
  local directory
  case "${host}" in
    claude) directory="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/harness-start" ;;
    codex) directory="${CODEX_HOME:-$HOME/.codex}/harness-start" ;;
    *) return 2 ;;
  esac

  run_cmd rm -f -- "${directory}/language-output.json"
  if [ "${DRY_RUN}" = "1" ]; then
    run_cmd rmdir -- "${directory}"
  else
    rmdir -- "${directory}" 2>/dev/null || true
  fi
}

uninstall_claude() {
  local raw marketplace_json marketplace_status plugins name
  local host_failed=0
  HOSTS_FOUND=$((HOSTS_FOUND + 1))
  log "Claude Code: discovering installed ${MARKETPLACE_NAME} plugins"
  if ! raw="$(claude plugin list --json)"; then
    err "Claude Code: unable to list installed plugins"
    FAILURES=$((FAILURES + 1))
    return
  fi
  if ! plugins="$(printf '%s' "${raw}" | claude_plugin_names)"; then
    err "Claude Code: unable to parse installed plugins"
    FAILURES=$((FAILURES + 1))
    return
  fi

  while IFS= read -r name || [ -n "${name}" ]; do
    [ -n "${name}" ] || continue
    if ! plugin_name_is_safe "${name}"; then
      warn "Claude Code: refusing unsafe plugin name: ${name}"
      host_failed=1
      continue
    fi
    if ! run_cmd claude plugin uninstall "${name}@${MARKETPLACE_NAME}" --scope "${CLAUDE_SCOPE}" --yes; then
      warn "Claude Code: failed to uninstall ${name}@${MARKETPLACE_NAME}"
      host_failed=1
    fi
  done <<<"${plugins}"

  if ! marketplace_json="$(claude plugin marketplace list --json 2>/dev/null)"; then
    warn "Claude Code: unable to list marketplaces"
    host_failed=1
  fi
  if [ "${host_failed}" = "0" ]; then
    if ! marketplace_status="$(marketplace_state "${marketplace_json}")"; then
      warn "Claude Code: unable to parse marketplace state"
      host_failed=1
    elif [ "${marketplace_status}" = "present" ]; then
      if ! run_cmd claude plugin marketplace remove "${MARKETPLACE_NAME}" --scope "${CLAUDE_SCOPE}"; then
        warn "Claude Code: failed to remove marketplace ${MARKETPLACE_NAME}"
        host_failed=1
      fi
    fi
  fi

  if [ "${host_failed}" = "0" ]; then
    cleanup_preference claude
    log "Claude Code: uninstall complete"
  else
    FAILURES=$((FAILURES + 1))
  fi
}

uninstall_codex() {
  local raw marketplace_json marketplace_status plugins name
  local host_failed=0
  HOSTS_FOUND=$((HOSTS_FOUND + 1))
  log "Codex: discovering installed ${MARKETPLACE_NAME} plugins"
  if ! raw="$(codex plugin list --marketplace "${MARKETPLACE_NAME}" --json)"; then
    err "Codex: unable to list installed plugins"
    FAILURES=$((FAILURES + 1))
    return
  fi
  if ! plugins="$(printf '%s' "${raw}" | codex_plugin_names)"; then
    err "Codex: unable to parse installed plugins"
    FAILURES=$((FAILURES + 1))
    return
  fi

  while IFS= read -r name || [ -n "${name}" ]; do
    [ -n "${name}" ] || continue
    if ! plugin_name_is_safe "${name}"; then
      warn "Codex: refusing unsafe plugin name: ${name}"
      host_failed=1
      continue
    fi
    if ! run_cmd codex plugin remove "${name}@${MARKETPLACE_NAME}" --json; then
      warn "Codex: failed to remove ${name}@${MARKETPLACE_NAME}"
      host_failed=1
    fi
  done <<<"${plugins}"

  if ! marketplace_json="$(codex plugin marketplace list --json 2>/dev/null)"; then
    warn "Codex: unable to list marketplaces"
    host_failed=1
  fi
  if [ "${host_failed}" = "0" ]; then
    if ! marketplace_status="$(marketplace_state "${marketplace_json}")"; then
      warn "Codex: unable to parse marketplace state"
      host_failed=1
    elif [ "${marketplace_status}" = "present" ]; then
      if ! run_cmd codex plugin marketplace remove "${MARKETPLACE_NAME}" --json; then
        warn "Codex: failed to remove marketplace ${MARKETPLACE_NAME}"
        host_failed=1
      fi
    fi
  fi

  if [ "${host_failed}" = "0" ]; then
    cleanup_preference codex
    log "Codex: uninstall complete"
  else
    FAILURES=$((FAILURES + 1))
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --claude-only) DO_CLAUDE=1; DO_CODEX=0; shift ;;
    --codex-only) DO_CLAUDE=0; DO_CODEX=1; shift ;;
    --scope)
      CLAUDE_SCOPE="${2:?--scope requires a value}"
      shift 2
      ;;
    --dry-run) DRY_RUN=1; shift ;;
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

if ! have_cmd jq; then
  err "jq is required to safely resolve installed plugin names"
  exit 1
fi

if [ "${DO_CLAUDE}" = "1" ]; then
  if have_cmd claude; then
    uninstall_claude
  else
    warn "Claude Code CLI not found; skipping"
  fi
fi

if [ "${DO_CODEX}" = "1" ]; then
  if have_cmd codex; then
    uninstall_codex
  else
    warn "Codex CLI not found; skipping"
  fi
fi

if [ "${HOSTS_FOUND}" = "0" ]; then
  err "neither requested host CLI is available"
  exit 1
fi

if [ "${FAILURES}" != "0" ]; then
  err "uninstall completed with ${FAILURES} host failure(s)"
  exit 1
fi

log "Harness Start uninstall finished"
