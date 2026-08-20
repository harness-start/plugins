#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
runner="${repo_root}/scripts/acceptance/lib/run-case.sh"
common="${repo_root}/scripts/acceptance/lib/common.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT
mkdir -p "${tmp}/lib" "${tmp}/repo/plugins/demo/acceptance/cases/01/workspace" "${tmp}/out"
cp "${runner}" "${tmp}/lib/run-case.sh"
printf 'first turn\n' >"${tmp}/repo/plugins/demo/acceptance/cases/01/prompt.md"
printf 'second turn\n' >"${tmp}/repo/plugins/demo/acceptance/cases/01/prompt-2.md"
cat >"${tmp}/repo/plugins/demo/acceptance/cases/01/expect.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat >"${tmp}/lib/common.sh" <<'EOF'
load_env_file() { export DEEPSEEK_MODEL=fixture; }
require_cmd() { :; }
copy_workspace() { mkdir -p "$2"; }
read_case_timeout() { printf '10\n'; }
read_case_allowed_host_exits() { printf '0\n'; }
install_plugin_skill_deps() { :; }
configure_claude_home() { :; }
configure_codex_home() { :; }
run_claude_session() { printf 'claude:first:%s\n' "$(cat "$3")" >>"${TRACE_FILE}"; : >"$4"; }
run_claude_continuation() { printf 'claude:continue:%s\n' "$(cat "$3")" >>"${TRACE_FILE}"; : >"$4"; }
run_codex_session() { printf 'codex:first:%s\n' "$(cat "$4")" >>"${TRACE_FILE}"; : >"$5"; }
run_codex_continuation() { printf 'codex:continue:%s\n' "$(cat "$2")" >>"${TRACE_FILE}"; : >"$3"; }
assert_deepseek_in_log() { :; }
host_exit_is_allowed() { [ "$1" = "$2" ]; }
EOF

for host in claude codex; do
  trace="${tmp}/${host}.trace"
  TRACE_FILE="${trace}" bash "${tmp}/lib/run-case.sh" "${tmp}/repo" demo 01 "${host}" "${tmp}/out"
  test "$(sed -n '1p' "${trace}")" = "${host}:first:first turn"
  test "$(sed -n '2p' "${trace}")" = "${host}:continue:second turn"
  test "$(wc -l <"${trace}" | tr -d ' ')" = "2"
done

mkdir -p "${tmp}/workspace"
printf 'continue with evidence\n' >"${tmp}/prompt.md"
export DEEPSEEK_MODEL=fixture DEEPSEEK_API_KEY=fixture TRACE_FILE="${tmp}/commands.trace"
# shellcheck source=lib/common.sh
. "${common}"
timeout() {
  printf '%s\n' "$*" >>"${TRACE_FILE}"
}
run_claude_continuation "${tmp}/workspace" "${tmp}/plugin" "${tmp}/prompt.md" "${tmp}/claude.log" 10
run_codex_continuation "${tmp}/workspace" "${tmp}/prompt.md" "${tmp}/codex.log" 10
claude_command="$(sed -n '1p' "${TRACE_FILE}")"
codex_command="$(sed -n '2p' "${TRACE_FILE}")"
case " ${claude_command} " in *" --continue "*) ;; *) exit 1 ;; esac
case " ${codex_command} " in *" codex exec resume --last "*) ;; *) exit 1 ;; esac

echo "OK plugin acceptance runner supports an optional second turn"
