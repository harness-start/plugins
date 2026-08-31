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
printf '%s\n' 'installed session-governance' >"${partial_home}/install-all.log"
expect_not_ready "${partial_home}"

complete_home="$(make_home complete-catalog)"
jq -r '.plugins[]?.name // empty' \
  "${REPO_ROOT}/.claude-plugin/marketplace.json" \
  >"${complete_home}/install-all.log"
expect_ready "${complete_home}"

missing_plugin_home="$(make_home missing-plugin)"
jq -r '.plugins[]?.name // empty' \
  "${REPO_ROOT}/.claude-plugin/marketplace.json" \
  | sed '/^engineering-workflow$/d' \
  >"${missing_plugin_home}/install-all.log"
expect_not_ready "${missing_plugin_home}"

configured_home="$(make_home configured-claude)"
mkdir -p "${configured_home}/.claude"
printf '%s\n' \
  '{"enabledPlugins":{"engineering-workflow@harness-start":true},"extraKnownMarketplaces":{"harness-start":{"source":{"source":"directory","path":"/marketplace"}}}}' \
  >"${configured_home}/.claude/settings.json"
DEEPSEEK_API_KEY="acceptance-test-key" configure_claude_home \
  "${configured_home}" "deepseek-v4-flash"
jq -e '
  .enabledPlugins["engineering-workflow@harness-start"] == true
  and .extraKnownMarketplaces["harness-start"].source.path == "/marketplace"
  and .env.ANTHROPIC_MODEL == "deepseek-v4-flash"
  and .permissions.defaultMode == "bypassPermissions"
' "${configured_home}/.claude/settings.json" >/dev/null

configured_codex_source="$(make_home configured-codex-source)"
configured_codex_dest="$(make_home configured-codex-dest)"
mkdir -p "${configured_codex_source}/.codex"
cat >"${configured_codex_source}/.codex/config.toml" <<'EOF'
[marketplaces.harness-start]
source_type = "local"
source = "/marketplace"

[plugins."session-governance@harness-start"]
enabled = true
EOF
printf '{}\n' >"${configured_codex_source}/models.json"
DEEPSEEK_API_KEY="acceptance-test-key" configure_codex_home \
  "${configured_codex_dest}" "deepseek-v4-flash" "${configured_codex_source}/models.json"
merge_project_codex_plugin_config \
  "${configured_codex_source}/.codex/config.toml" \
  "${configured_codex_dest}/config.toml"
grep -Fq 'model = "deepseek-v4-flash"' "${configured_codex_dest}/config.toml"
grep -Fq '[marketplaces.harness-start]' "${configured_codex_dest}/config.toml"
grep -Fq '[plugins."session-governance@harness-start"]' "${configured_codex_dest}/config.toml"
grep -Fq 'enabled = true' "${configured_codex_dest}/config.toml"

fixture_root="${tmp_root}/project-case-fixture"
mkdir -p \
  "${fixture_root}/lib" \
  "${fixture_root}/repo/acceptance/scenarios/demo/01/workspace" \
  "${fixture_root}/repo/docker/host-acceptance" \
  "${fixture_root}/out"
cp "${SCRIPT_DIR}/lib/run-project-case.sh" "${fixture_root}/lib/run-project-case.sh"
printf 'deliver the fixture\n' >"${fixture_root}/repo/acceptance/scenarios/demo/01/prompt.md"
printf '{}\n' >"${fixture_root}/repo/docker/host-acceptance/models.json"
cat >"${fixture_root}/repo/acceptance/scenarios/demo/01/expect.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat >"${fixture_root}/lib/common.sh" <<'EOF'
load_env_file() { export DEEPSEEK_MODEL=fixture; }
require_cmd() { :; }
copy_workspace() { mkdir -p "$2"; }
read_case_timeout() { printf '10\n'; }
configure_claude_home() { :; }
run_claude_session_installed() { printf 'host-session\n' >>"${TRACE_FILE}"; : >"$3"; }
assert_deepseek_in_log() { :; }
seed_host_skills_into_home() { printf 'undeclared-host-skills\n' >>"${TRACE_FILE}"; }
EOF
cat >"${fixture_root}/lib/project-common.sh" <<'EOF'
project_case_dir() { printf '%s/%s\n' "$1" "$2"; }
ensure_project_install_cache() { mkdir -p "$2/cache"; printf '%s/cache\n' "$2"; }
seed_project_install_home() { printf 'project-install\n' >>"${TRACE_FILE}"; mkdir -p "$2"; }
assert_project_install_ready() { return 0; }
EOF
TRACE_FILE="${fixture_root}/case.trace" bash \
  "${fixture_root}/lib/run-project-case.sh" \
  "${fixture_root}/repo" demo/01 claude "${fixture_root}/out"
test "$(sed -n '1p' "${fixture_root}/case.trace")" = "project-install"
test "$(sed -n '2p' "${fixture_root}/case.trace")" = "host-session"
test "$(wc -l <"${fixture_root}/case.trace" | tr -d ' ')" = "2"

wrapper_root="${tmp_root}/project-wrapper"
mkdir -p "${wrapper_root}/repo/scripts/acceptance/lib" "${wrapper_root}/bin" "${wrapper_root}/out"
cp "${SCRIPT_DIR}/run-project.sh" "${wrapper_root}/repo/scripts/acceptance/run-project.sh"
cp "${SCRIPT_DIR}/lib/common.sh" "${wrapper_root}/repo/scripts/acceptance/lib/common.sh"
cp "${SCRIPT_DIR}/lib/project-common.sh" "${wrapper_root}/repo/scripts/acceptance/lib/project-common.sh"
printf 'DEEPSEEK_API_KEY=fixture\nDEEPSEEK_MODEL=deepseek-v4-flash\n' >"${wrapper_root}/repo/.env"
cat >"${wrapper_root}/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"${DOCKER_TRACE}"
EOF
chmod +x "${wrapper_root}/bin/docker"
DOCKER_TRACE="${wrapper_root}/docker.trace" \
  PATH="${wrapper_root}/bin:${PATH}" \
  ACCEPT_OUT_DIR="${wrapper_root}/out" \
  bash "${wrapper_root}/repo/scripts/acceptance/run-project.sh" --skip-honesty
docker_run="$(sed -n '2p' "${wrapper_root}/docker.trace")"
case " ${docker_run} " in
  *" --tmpfs /marketplace/.acceptance-runs:rw,noexec,nosuid,nodev,size=16m,mode=1777 "*) ;;
  *) printf 'project acceptance did not isolate historical outputs\n' >&2; exit 1 ;;
esac
case " ${docker_run} " in
  *" /opt/host-skills "*|*" ACCEPT_HOST_SKILLS_DIR "*)
    printf 'project acceptance mounted undeclared host Skills\n' >&2
    exit 1
    ;;
esac

printf 'project-common readiness tests passed\n'
