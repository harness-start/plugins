#!/usr/bin/env bash
# Shared honesty helpers for host-acceptance expect.sh scripts.
#
# Contract: deny/block primary cases PASS only when BOTH
#   1) world-state is correct, and
#   2) the host log contains a real product/hook marker.
#
# Forbidden in signal REs: workspace path fragments, plugin slugs, run-id
# pieces, or anything that appears only because prompt.md / workdir is logged.
# shellcheck disable=SC2034

set -euo pipefail

require_nonempty_host_log() {
  if [ -z "${ACCEPT_LOG:-}" ] || [ ! -s "${ACCEPT_LOG}" ]; then
    echo "expect fail: empty or missing ACCEPT_LOG" >&2
    return 1
  fi
}

require_deepseek_codex_model() {
  if [ "${ACCEPT_HOST:-}" != "codex" ]; then
    return 0
  fi
  if ! grep -Eiq 'model:[[:space:]]*deepseek|provider:[[:space:]]*deepseek|deepseek-v4-flash' "${ACCEPT_LOG}"; then
    echo "expect fail: codex session did not report DeepSeek model" >&2
    return 1
  fi
}

require_host_session_started() {
  require_nonempty_host_log || return 1
  if grep -Eiq 'failed to load configuration|CODEX_HOME points to' "${ACCEPT_LOG}" \
    && ! grep -Eiq 'model:|provider: deepseek|deepseek-v4-flash|hook:|Hook |permissionDecision' "${ACCEPT_LOG}"; then
    echo "expect fail: host failed to start a real session" >&2
    return 1
  fi
  require_deepseek_codex_model || return 1
}

# require_guard_hook_signal <regex>
# Regex must match real hook/product markers only.
require_guard_hook_signal() {
  local re="${1:?marker regex required}"
  if ! grep -Eq "${re}" "${ACCEPT_LOG}"; then
    echo "expect fail: no real guard/hook signal matching: ${re}" >&2
    return 1
  fi
}

require_file_absent() {
  local path="${1:?path required}"
  if [ -e "${path}" ]; then
    echo "expect fail: path must be absent: ${path}" >&2
    return 1
  fi
}

require_file_exists() {
  local path="${1:?path required}"
  if [ ! -f "${path}" ]; then
    echo "expect fail: file must exist: ${path}" >&2
    return 1
  fi
}

require_composer_json_without_repositories() {
  local file="${1:?composer.json path}"
  if [ ! -f "${file}" ]; then
    echo "expect fail: missing ${file}" >&2
    return 1
  fi
  if grep -q '"repositories"' "${file}"; then
    echo "expect fail: composer.json still has repositories" >&2
    return 1
  fi
}

# Plugin-specific real marker sets (never path fragments).
MARKERS_INTENT_CLARIFY='\[intent-clarify-gate\]|业务写入已拦截|写屏障已解除|访谈尚未结束|访谈已结束'
MARKERS_FILE_BUDGET='\[File Budget\]|超出文件行数预算|超出构建配方参考预算'
MARKERS_PROTECTED_FILE='\[Protected File Guard\]|已拦截受保护文件修改'
MARKERS_ENCODING_GUARD='\[Encoding Guard\]|检测到禁止的文件编码'
MARKERS_COMMAND_SAFETY='\[Cat Write Guard\]|\[sed -i Guard\]|\[Dangerous Command\]'
MARKERS_PHP_REPOSITORIES='\[Composer Repositories Guard\]|Repositories Guard'
MARKERS_LARAVEL='\[Laravel Protected Path\]'
MARKERS_THINKPHP='\[ThinkPHP Protected Path\]'
MARKERS_WEBMAN='\[Webman Protected Path\]'
MARKERS_SYMFONY='\[Symfony Protected Path\]'
MARKERS_LANGUAGE_OUTPUT='\[language-output-governance\] profile='
MARKERS_LANGUAGE_OUTPUT_FEEDBACK='\[Language Output Feedback\]'
MARKERS_LANGUAGE_OUTPUT_GATE='\[Language Output Gate\]'
MARKERS_SUBAGENT_DISCIPLINE='\[Subagent Contract\]'
MARKERS_SPEC_PLAN='\[Spec Plan Gate\]'
MARKERS_BACKUP_ARTIFACT='\[Backup Artifact Guard\]'
MARKERS_SOURCE_SANITY='\[Source Sanity Guard\]|检测到不安全的源码写入|检测到未解决的合并冲突'
MARKERS_CODE_QUALITY='\[Code Quality Guard\]|源码检查结果|PHPStan 批量检查结果'
MARKERS_STOP_BLOCK='hook: Stop Blocked|Stop hook blocked'
MARKERS_GIT_ADD='\[Git Add Guard\]'
MARKERS_LOCKFILE='\[Lockfile Guard\]'
MARKERS_INFRA_DEVOPS='\[Dangerous Infra Command\]'
MARKERS_WEB_FRONTEND='\[WeChat Mini Program Config\]'
# Shared deny surface when host surfaces JSON/hook text without path fragments:
MARKERS_HOOK_DENY='permissionDecision":"deny|permissionDecision.: .?deny|PreToolUse Blocked|Hook denied tool use|Command blocked by PreToolUse hook'
