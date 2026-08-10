#!/usr/bin/env bash
# Project /goal logo e2e: full install-all + open brief → final artifacts + quality notes.
set -euo pipefail

# acceptance/scenarios/<domain>/cases/<id>/expect.sh → repo root is 5 levels up
REPO="${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}"
. "${REPO}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started

notes="${ACCEPT_OUT}/quality-notes.md"
: >"${notes}"
{
  echo "# Quality notes — logo-design/01-goal-e2e-delivery"
  echo
  echo "- host: ${ACCEPT_HOST:-}"
  echo "- workspace: ${ACCEPT_WORKSPACE:-}"
  echo "- generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
} >>"${notes}"

fail=0
score=0

note() { printf '%s\n' "$*" | tee -a "${notes}" >&2; }
ok() { note "- PASS: $*"; }
bad() { note "- FAIL: $*"; fail=$((fail + 1)); }
soft() { note "- NOTE: $*"; }

# --- install-all stack -------------------------------------------------------
if [ -z "${HOME:-}" ] || [ ! -s "${HOME}/install-all.log" ]; then
  bad "missing install-all.log under HOME"
else
  ok "install-all.log present"
fi
if [ -s "${HOME}/install-all.log" ] && grep -Eq 'logo-project-delivery-guard' "${HOME}/install-all.log"; then
  ok "catalog includes logo-project-delivery-guard"
else
  bad "install-all did not install logo-project-delivery-guard"
fi
if [ -s "${HOME}/install-all.log" ] && grep -Eq 'goal-task-gate' "${HOME}/install-all.log"; then
  ok "catalog includes goal-task-gate"
else
  bad "install-all did not install goal-task-gate"
fi
if [ -f "${HOME}/.agents/skills/grill-me/SKILL.md" ] \
  || [ -f "${HOME}/.claude/skills/grill-me/SKILL.md" ]; then
  ok "skill-deps canary grill-me present"
  score=$((score + 1))
else
  bad "community skill-deps not installed (grill-me missing under .agents or .claude skills)"
fi

# --- /goal trail (soft for first e2e: logo delivery is primary signal) -------
# goal-task-gate is fail-open on hook errors; marketplace install may not always
# inject/arm visibly in Claude -p logs. Prefer deliverables over trail for now.
goal_root="${ACCEPT_WORKSPACE}/.goal-task"
if [ -d "${goal_root}/runs" ]; then
  ok "goal-task audit root exists"
  score=$((score + 1))
elif grep -Eq "${MARKERS_GOAL_TASK}|goal-task-gate|/goal " "${ACCEPT_LOG}"; then
  soft "goal-task signal in log but no .goal-task/runs on disk"
  score=$((score + 1))
else
  soft "no .goal-task trail observed (soft; logo artifacts remain the hard bar)"
fi

if [ -f "${goal_root}/CURRENT" ]; then
  run_id="$(tr -d '[:space:]' <"${goal_root}/CURRENT" || true)"
  soft "CURRENT run_id=${run_id}"
  if [ -n "${run_id}" ] && [ -f "${goal_root}/runs/${run_id}/decisions.tsv" ]; then
    ok "decisions.tsv present for CURRENT"
    score=$((score + 1))
    if tail -n 1 "${goal_root}/runs/${run_id}/decisions.tsv" | grep -Eq $'\tclose\t'; then
      soft "trail tip looks like close"
      score=$((score + 1))
    else
      soft "trail has no close tip yet"
    fi
  fi
fi

if grep -Eq 'GOAL_TASK_DONE' "${ACCEPT_LOG}"; then
  soft "GOAL_TASK_DONE seen in host log"
  score=$((score + 1))
fi

# --- logo artifacts ----------------------------------------------------------
logo_root="${ACCEPT_WORKSPACE}/artifacts/logo"
mapfile -t logo_ids < <(find "${logo_root}" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | sort || true)

if [ "${#logo_ids[@]}" -eq 0 ]; then
  bad "no artifacts/logo/<id>/ directory created"
else
  ok "logo project dir(s): ${logo_ids[*]}"
  score=$((score + 2))
fi

for id in "${logo_ids[@]:-}"; do
  [ -n "${id}" ] || continue
  base="${logo_root}/${id}"
  soft "inspecting ${base}"

  # Structural progress (not full release contract — first e2e is observational).
  for rel in \
    plan.contract.json \
    logo.project.json \
    src/master/Mark.logo.tsx \
    src/master/Wordmark.logo.tsx \
    src/master/Lockup.logo.tsx \
    build/master/mark.svg \
    src/concepts/manifest.json
  do
    if [ -f "${base}/${rel}" ]; then
      soft "present: ${rel}"
      score=$((score + 1))
    else
      soft "missing: ${rel}"
    fi
  done

  # Vector craft sniff: master TSX/SVG should not be pure placeholders if present.
  if [ -f "${base}/src/master/Mark.logo.tsx" ]; then
    if grep -Eq '<\s*svg\b' "${base}/src/master/Mark.logo.tsx"; then
      ok "Mark.logo.tsx contains SVG markup"
      score=$((score + 1))
    else
      soft "Mark.logo.tsx lacks <svg>"
    fi
    if grep -Eiq 'Arial|Helvetica|sans-serif|思源|Source Han|system-ui' "${base}/src/master/Mark.logo.tsx"; then
      soft "possible system-font smell in Mark.logo.tsx (quality concern)"
    fi
  fi

  if [ -f "${base}/build/master/mark.svg" ]; then
    if grep -Eq 'viewBox=' "${base}/build/master/mark.svg"; then
      ok "build/master/mark.svg has viewBox"
      score=$((score + 1))
    else
      soft "build/master/mark.svg missing viewBox"
    fi
  fi
done

# Contract probe via shipped project-validate (source). Prefer formal Fib findings.
validate_js="${REPO}/plugins/logo-project-delivery-guard/scripts/tools/project-validate.mjs"
if [ "${#logo_ids[@]}" -gt 0 ] && [ -f "${validate_js}" ] && command -v node >/dev/null 2>&1; then
  id="${logo_ids[0]}"
  set +e
  node "${validate_js}" "${logo_root}/${id}" --stage source --json >>"${notes}" 2>&1
  probe_rc=$?
  set -e
  if [ "${probe_rc}" -eq 0 ]; then
    ok "source contract validate clean for ${id}"
    score=$((score + 2))
  else
    soft "source contract still has findings for ${id} (see quality-notes.md)"
  fi
  # Formal construction signal: fibonacci.json should declare circles when present
  fib="${logo_root}/${id}/src/construction/fibonacci.json"
  if [ -f "${fib}" ] && jq -e '.circles | length >= 3' "${fib}" >/dev/null 2>&1; then
    ok "fibonacci.json declares ≥3 formal circles"
    score=$((score + 1))
  else
    soft "fibonacci formal circles not present yet"
  fi
fi

{
  echo
  echo "## Rubric score (heuristic)"
  echo "- auto_score_points: ${score}"
  echo "- structural_fail_count: ${fail}"
  echo "- see quality-rubric.md in case dir for human dimensions"
  echo
  echo "## Host log tail"
  echo '```'
  tail -n 40 "${ACCEPT_LOG}" 2>/dev/null || true
  echo '```'
} >>"${notes}"

note "quality-notes written to ${notes} (score=${score} fails=${fail})"

# Hard gate for first e2e: install stack + some logo artifact progress.
# Full release receipt is NOT required yet — observe quality in notes.
if [ "${fail}" -ne 0 ]; then
  exit 1
fi
if [ "${#logo_ids[@]}" -eq 0 ]; then
  exit 1
fi
if [ "${score}" -lt 4 ]; then
  note "FAIL: auto score ${score} < 4 (too little delivery signal)"
  exit 1
fi

echo "OK project logo /goal e2e: structural bar met; review ${notes} for quality"
exit 0
