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

# require_hook_prompt_signal <regex>
# Claude includes command-hook output in its debug log. Codex stores blocking
# Stop details as a structured user hook_prompt in the rollout JSONL.
require_hook_prompt_signal() {
  local re="${1:?hook prompt regex required}"
  if [ "${ACCEPT_HOST:-}" = "claude" ]; then
    if grep -Eq "${re}" "${ACCEPT_LOG}"; then
      return 0
    fi
  elif [ "${ACCEPT_HOST:-}" = "codex" ]; then
    local rollout
    while IFS= read -r -d '' rollout; do
      if jq -se --arg re "${re}" '
        any(.[ ];
          .type == "response_item"
          and .payload.type == "message"
          and .payload.role == "user"
          and any(.payload.content[]?;
            .type == "input_text"
            and (.text | startswith("<hook_prompt"))
            and (.text | test($re))
          )
        )
      ' "${rollout}" >/dev/null 2>&1; then
        return 0
      fi
    done < <(find "${ACCEPT_OUT:?}/codex-home/sessions" -type f -name '*.jsonl' -print0 2>/dev/null)
  fi
  echo "expect fail: no structured hook prompt signal matching: ${re}" >&2
  return 1
}

# require_session_context_signal <regex>
# SessionStart context is surfaced differently by each host. Claude logs the
# hook response; Codex records the injected developer message in its rollout.
# Inspect those structured surfaces so reading plugin source cannot fake a hit.
require_session_context_signal() {
  local re="${1:?session context regex required}"
  if [ "${ACCEPT_HOST:-}" = "claude" ]; then
    if grep -E '"hookEventName":"SessionStart".*"additionalContext"' "${ACCEPT_LOG}" | grep -Eq "${re}"; then
      return 0
    fi
  elif [ "${ACCEPT_HOST:-}" = "codex" ]; then
    local rollout
    while IFS= read -r -d '' rollout; do
      if jq -se --arg re "${re}" '
        any(.[];
          .type == "response_item"
          and .payload.type == "message"
          and .payload.role == "developer"
          and any(.payload.content[]?; .type == "input_text" and (.text | test($re)))
        )
      ' "${rollout}" >/dev/null 2>&1; then
        return 0
      fi
    done < <(find "${ACCEPT_OUT:?}/codex-home/sessions" -type f -name '*.jsonl' -print0 2>/dev/null)
  fi
  echo "expect fail: no SessionStart context signal matching: ${re}" >&2
  return 1
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

# require_research_seal_receipt <research.json>
# A canonical artifact is insufficient by itself: require a matching receipt
# emitted by the host's PostToolUse hook after a real MCP tool call.
require_research_seal_receipt() {
  local manifest="${1:?research manifest required}"
  local run_id seal receipt
  run_id="$(jq -r '.run_id // empty' "${manifest}")"
  seal="$(jq -r '.integrity.seal // empty' "${manifest}")"
  if [ -z "${run_id}" ] || [ -z "${seal}" ]; then
    echo "expect fail: manifest is missing run id or seal: ${manifest}" >&2
    return 1
  fi
  while IFS= read -r -d '' receipt; do
    if jq -e --arg run_id "${run_id}" --arg seal "${seal}" \
      '.type == "receipt" and .payload.tool == "research_seal" and .payload.runId == $run_id and .payload.seal == $seal' \
      "${receipt}" >/dev/null 2>&1; then
      return 0
    fi
  done < <(find "${ACCEPT_OUT:?}" -path '*/research-provenance-guard/hook-events/*.json' -type f -print0)
  echo "expect fail: no matching research_seal PostToolUse receipt" >&2
  return 1
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
MARKERS_INTENT_CLARIFY='\[intent-clarify-gate\]|business writes are blocked|write barrier is released|interview is still open|interview is closed'
MARKERS_FIRST_PRINCIPLES='\[first-principles-gate\]|First-principles mode is open|business writes are blocked|write barrier is released|first-principles session is closed'
MARKERS_FIRST_PRINCIPLES_STOP='Completion or closure requires|on-disk first-principles ledger|stale for this session|First-principles mode is still open|Independent challenger review is required|FP_REVIEW_REQUEST challenger'
MARKERS_REASONING_DISCIPLINE='\[Reasoning Discipline Guard\]|Bound RW-|Accepted (frame|analysis|challenge|cross-check|conclusion) as RD-R[1-5]|Workflow closed with RD-R5|RD_REVIEW_REQUEST (challenge|cross-check)|independent (challenge|cross-check) review'
MARKERS_INDEPENDENT_REVIEW='RD_REVIEW_REQUEST|DBG_REVIEW_REQUEST|FP_REVIEW_REQUEST|WRI_REVIEW_REQUEST|independent (challenge|cross-check|diagnosis|challenger|critic) review'
MARKERS_FILE_BUDGET='\[File Budget\]|exceeds its file line budget|exceeds the build-recipe reference budget'
MARKERS_PROTECTED_FILE='\[Protected File Guard\]|Protected file modification blocked'
MARKERS_ENCODING_GUARD='\[Encoding Guard\]|Prohibited file encoding detected'
MARKERS_MARKDOWN_FORMAT='\[Markdown Format Guard\]|Markdown formatting issues detected'
MARKERS_COMMAND_SAFETY='\[Cat Write Guard\]|\[sed -i Guard\]|\[Dangerous Command\]'
MARKERS_PHP_REPOSITORIES='\[Composer Repositories Guard\]|Repositories Guard'
MARKERS_LARAVEL='\[Laravel Protected Path\]'
MARKERS_THINKPHP='\[ThinkPHP Protected Path\]'
MARKERS_WEBMAN='\[Webman Protected Path\]'
MARKERS_SYMFONY='\[Symfony Protected Path\]'
MARKERS_LANGUAGE_OUTPUT='\[language-output-governance\] profile='
MARKERS_LANGUAGE_OUTPUT_FEEDBACK='\[Language Output Feedback\]'
MARKERS_LANGUAGE_OUTPUT_GATE='\[Language Output Gate\]'
MARKERS_SKILL_ROUTING_TRANSPARENCY='\[Skill Routing Transparency( Reminder)?\]|📌 Skill route'
MARKERS_SUBAGENT_WORKFLOW_GUARD='\[Subagent Workflow Guard\]|SUBAGENT_APPLICATION|Result Card'
MARKERS_RESEARCH_PROVENANCE='\[Research Provenance Guard\]|Research-Evidence: research-evidence/v1|Validating research evidence seal'
MARKERS_SPEC_PLAN='\[Spec Plan Gate\]'
MARKERS_BACKUP_ARTIFACT='\[Backup Artifact Guard\]'
MARKERS_SOURCE_SANITY='\[Source Sanity Guard\]|Unsafe source write detected|Unresolved merge conflict detected'
MARKERS_CODE_QUALITY='\[Code Quality Guard\]|Source check results|PHPStan batch check results'
MARKERS_STOP_BLOCK='hook: Stop Blocked|Stop hook blocked'
MARKERS_GIT_ADD='\[Git Add Guard\]'
MARKERS_LOCKFILE='\[Lockfile Guard\]'
MARKERS_INFRA_DEVOPS='\[Dangerous Infra Command\]'
MARKERS_WEB_FRONTEND='\[WeChat Mini Program Config\]'
# Shared deny surface when host surfaces JSON/hook text without path fragments:
MARKERS_HOOK_DENY='permissionDecision":"deny|permissionDecision.: .?deny|PreToolUse Blocked|Hook denied tool use|Command blocked by PreToolUse hook'
