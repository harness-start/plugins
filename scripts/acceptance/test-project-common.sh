#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/project-common.sh
. "${SCRIPT_DIR}/lib/project-common.sh"

tmp_root="$(mktemp -d)"
trap 'rm -rf -- "${tmp_root}"' EXIT

make_home() {
  local name="$1"
  local home_dir="${tmp_root}/${name}"
  mkdir -p "${home_dir}"
  printf '%s\n' "${home_dir}"
}

expect_ready() {
  local home_dir="$1"
  if ! assert_project_install_ready "${home_dir}" "${REPO_ROOT}"; then
    printf 'expected install home to be ready: %s\n' "${home_dir}" >&2
    exit 1
  fi
}

expect_not_ready() {
  local home_dir="$1"
  if assert_project_install_ready "${home_dir}" "${REPO_ROOT}"; then
    printf 'expected install home to be rejected: %s\n' "${home_dir}" >&2
    exit 1
  fi
}

missing_log_home="$(make_home missing-log)"
expect_not_ready "${missing_log_home}"

partial_home="$(make_home partial-catalog)"
printf '%s\n' 'installed brand-logo-production' >"${partial_home}/install-all.log"
expect_not_ready "${partial_home}"

complete_home="$(make_home complete-catalog)"
jq -r '.plugins[]?.name // empty' \
  "${REPO_ROOT}/.claude-plugin/marketplace.json" \
  >"${complete_home}/install-all.log"
expect_ready "${complete_home}"

missing_plugin_home="$(make_home missing-plugin)"
jq -r '.plugins[]?.name // empty' \
  "${REPO_ROOT}/.claude-plugin/marketplace.json" \
  | sed '/^software-debugging$/d' \
  >"${missing_plugin_home}/install-all.log"
expect_not_ready "${missing_plugin_home}"

configured_home="$(make_home configured-claude)"
mkdir -p "${configured_home}/.claude"
printf '%s\n' \
  '{"enabledPlugins":{"software-debugging@harness-start":true},"extraKnownMarketplaces":{"harness-start":{"source":{"source":"directory","path":"/marketplace"}}}}' \
  >"${configured_home}/.claude/settings.json"
DEEPSEEK_API_KEY="acceptance-test-key" configure_claude_home \
  "${configured_home}" "deepseek-v4-flash"
jq -e '
  .enabledPlugins["software-debugging@harness-start"] == true
  and .extraKnownMarketplaces["harness-start"].source.path == "/marketplace"
  and .env.ANTHROPIC_MODEL == "deepseek-v4-flash"
  and .permissions.defaultMode == "bypassPermissions"
' "${configured_home}/.claude/settings.json" >/dev/null

if rg -q 'seed_host_skills_into_home' "${SCRIPT_DIR}/lib/run-project-case.sh"; then
  printf 'project acceptance must not seed undeclared host Skills into a consumer HOME\n' >&2
  exit 1
fi
if rg -q 'ACCEPT_HOST_SKILLS_DIR|/opt/host-skills' "${SCRIPT_DIR}/run-project.sh"; then
  printf 'project acceptance must not mount undeclared host Skills into Docker\n' >&2
  exit 1
fi
if ! rg -q -- '--tmpfs[[:space:]]+/marketplace/\.acceptance-runs' "${SCRIPT_DIR}/run-project.sh"; then
  printf 'project acceptance must hide historical acceptance outputs from live agents\n' >&2
  exit 1
fi

printf 'project-common readiness tests passed\n'
