#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started
require_guard_hook_signal 'Registered 4 hooks from 1 plugins|hook: SessionStart|Hook.*SessionStart'
require_file_absent "${ACCEPT_WORKSPACE}/.reasoning-discipline"

if grep -Eq 'Bound RW-|Accepted (frame|analysis|challenge|cross-check|conclusion) as RD-R' "${ACCEPT_LOG}"; then
  echo "expect fail: tool-free answer activated a reasoning workflow" >&2
  exit 1
fi

if [ "${ACCEPT_HOST}" = "claude" ]; then
  if grep -Eq 'tool_dispatch_start tool=' "${ACCEPT_LOG}"; then
    echo "expect fail: Claude used a tool for a tool-free answer" >&2
    exit 1
  fi
  answer="$(awk '/^===== claude-debug-file =====$/{exit} {print}' "${ACCEPT_LOG}" | sed '/^[[:space:]]*$/d')"
elif [ "${ACCEPT_HOST}" = "codex" ]; then
  if grep -Eq '^(exec|apply_patch|web|mcp|view_image)$' "${ACCEPT_LOG}"; then
    echo "expect fail: Codex used a tool for a tool-free answer" >&2
    exit 1
  fi
  answer="$(awk '/^codex$/{capture=1; next} capture && /^hook: Stop$/{exit} capture {print}' "${ACCEPT_LOG}" | sed '/^[[:space:]]*$/d')"
else
  echo "expect fail: unsupported host ${ACCEPT_HOST}" >&2
  exit 1
fi

if [ "${answer}" != "21" ]; then
  echo "expect fail: final answer must be exactly 21; got: ${answer}" >&2
  exit 1
fi

echo "OK tool-free exact candy answer is 21"
