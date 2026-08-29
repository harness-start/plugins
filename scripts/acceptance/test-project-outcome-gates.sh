#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

tmp_root="$(mktemp -d)"
trap 'rm -rf -- "${tmp_root}"' EXIT

prepare_case() {
  local case_id="$1"
  local name="$2"
  local case_dir="${REPO_ROOT}/acceptance/scenarios/${case_id%%/*}/cases/${case_id#*/}"
  local run_root="${tmp_root}/${name}"

  mkdir -p "${run_root}/out"
  copy_workspace "${case_dir}" "${run_root}/workspace"
  printf '%s\n' 'model: deepseek-v4-flash' >"${run_root}/host.log"
  printf '%s\n' "${run_root}"
}

run_gate() {
  local case_id="$1"
  local run_root="$2"
  local case_dir="${REPO_ROOT}/acceptance/scenarios/${case_id%%/*}/cases/${case_id#*/}"

  ACCEPT_REPO="${REPO_ROOT}" \
  ACCEPT_WORKSPACE="${run_root}/workspace" \
  ACCEPT_LOG="${run_root}/host.log" \
  ACCEPT_HOST="claude" \
  ACCEPT_OUT="${run_root}/out" \
    bash "${case_dir}/expect.sh"
}

expect_pass() {
  local case_id="$1"
  local run_root="$2"
  if ! run_gate "${case_id}" "${run_root}" >/dev/null 2>&1; then
    printf 'expected outcome gate to pass: %s (%s)\n' "${case_id}" "${run_root}" >&2
    exit 1
  fi
}

expect_fail() {
  local case_id="$1"
  local run_root="$2"
  if run_gate "${case_id}" "${run_root}" >/dev/null 2>&1; then
    printf 'expected outcome gate to fail closed: %s (%s)\n' "${case_id}" "${run_root}" >&2
    exit 1
  fi
}

software_case="software-change/01-fix-retry-delay"
software_ok="$(prepare_case "${software_case}" software-ok)"
perl -0pi -e 's/2 \*\* attempt/2 ** (attempt - 1)/' \
  "${software_ok}/workspace/src/retry-delay.mjs"
expect_pass "${software_case}" "${software_ok}"

software_tamper="$(prepare_case "${software_case}" software-test-tamper)"
printf '%s\n' \
  'import assert from "node:assert/strict";' \
  'import { test } from "node:test";' \
  'import { retryDelay } from "../src/retry-delay.mjs";' \
  'test("accepts the regression", () => assert.equal(retryDelay(1), 200));' \
  >"${software_tamper}/workspace/test/retry-delay.test.mjs"
expect_fail "${software_case}" "${software_tamper}"

config_case="configuration-change/01-update-retry-policy"
config_ok="$(prepare_case "${config_case}" config-ok)"
jq '.retry.maxAttempts = 5 | .retry.baseDelayMs = 500 | .features.adaptiveBackoff = true' \
  "${config_ok}/workspace/config/runtime.json" \
  >"${config_ok}/workspace/config/runtime.json.next"
mv "${config_ok}/workspace/config/runtime.json.next" \
  "${config_ok}/workspace/config/runtime.json"
expect_pass "${config_case}" "${config_ok}"

config_tamper="$(prepare_case "${config_case}" config-scope-tamper)"
jq '.retry.maxAttempts = 5 | .retry.baseDelayMs = 500 | .features.adaptiveBackoff = true' \
  "${config_tamper}/workspace/config/runtime.json" \
  >"${config_tamper}/workspace/config/runtime.json.next"
mv "${config_tamper}/workspace/config/runtime.json.next" \
  "${config_tamper}/workspace/config/runtime.json"
printf '\n// unrelated test edit\n' \
  >>"${config_tamper}/workspace/test/runtime-config.test.mjs"
expect_fail "${config_case}" "${config_tamper}"

research_case="research/01-rollout-decision-brief"
research_ok="$(prepare_case "${research_case}" research-ok)"
mkdir -p "${research_ok}/workspace/deliverables"
printf '%s\n' \
  '# Rollout decision' \
  '' \
  '## Recommendation' \
  'Use a staged rollout beginning with a 10% desktop cohort. This is an inference from the lower measured error rate in the staged pilot and the explicit operations policy.' \
  '' \
  '## Evidence' \
  '- The 14-day pilot served 10% of desktop traffic and measured a 1.2% error rate (pilot-results.md:L3-L4).' \
  '- The earlier all-at-once launch reached 4.8% errors and was rolled back (pilot-results.md:L5).' \
  '- Stop expansion above a 2.0% rolling error rate or 800 ms p95 latency (operations-policy.md:L4).' \
  '- Advance only after 24 hours below both thresholds (operations-policy.md:L5).' \
  '' \
  '## Evidence gap' \
  'Mobile clients were not included, so mobile reliability is unknown and needs a separate cohort before broad launch (pilot-results.md:L6).' \
  >"${research_ok}/workspace/deliverables/rollout-decision.md"
expect_pass "${research_case}" "${research_ok}"

research_tamper="$(prepare_case "${research_case}" research-citation-tamper)"
mkdir -p "${research_tamper}/workspace/deliverables"
printf '%s\n' \
  '# Rollout decision' \
  '' \
  'Use a staged rollout beginning with a 10% cohort after a 14-day pilot.' \
  'The staged error rate was 1.2%; the all-at-once result was 4.8%.' \
  'Stop at a 2.0% error rate or 800 ms latency.' \
  'Mobile reliability is unknown because no mobile clients were included.' \
  'These details came from pilot-results.md and operations-policy.md, but this deliberately omits line-level citations.' \
  'The recommendation is an inference from the supplied measurements and policy, not an externally verified claim.' \
  >"${research_tamper}/workspace/deliverables/rollout-decision.md"
expect_fail "${research_case}" "${research_tamper}"

logo_case="logo-design/01-goal-e2e-delivery"
logo_expect="${REPO_ROOT}/acceptance/scenarios/logo-design/cases/01-goal-e2e-delivery/expect.sh"
if ! grep -Eq "install-all evidence for artifact-production|catalog contains artifact-production" "${logo_expect}"; then
  printf 'logo outcome gate does not require the fused artifact-production owner\n' >&2
  exit 1
fi
if grep -Eq "install-all evidence for brand-logo-production|catalog contains brand-logo-production" "${logo_expect}"; then
  printf 'logo outcome gate still requires the removed brand-logo-production module\n' >&2
  exit 1
fi
logo_theater="$(prepare_case "${logo_case}" logo-theater)"
mkdir -p "${logo_theater}/home" "${logo_theater}/bin" \
  "${logo_theater}/workspace/artifacts/logo/theater/src/master" \
  "${logo_theater}/workspace/artifacts/logo/theater/src/concepts" \
  "${logo_theater}/workspace/artifacts/logo/theater/build/master"
printf '%s\n' 'installed artifact-production' >"${logo_theater}/home/install-all.log"
for rel in plan.contract.json plan.brief.json plan.skill-composition.json logo.project.json src/concepts/manifest.json; do
  printf '%s\n' '{}' >"${logo_theater}/workspace/artifacts/logo/theater/${rel}"
done
printf '%s\n' '{"targetStage":"release"}' >"${logo_theater}/workspace/artifacts/logo/theater/plan.contract.json"
for role in Mark Wordmark Lockup; do
  printf '%s\n' 'export function Logo(){return <svg viewBox="0 0 1 1"><path d="M0 0H1V1Z"/></svg>}' \
    >"${logo_theater}/workspace/artifacts/logo/theater/src/master/${role}.logo.tsx"
done
printf '%s\n' '<svg viewBox="0 0 1 1"><path d="M0 0H1V1Z"/></svg>' \
  >"${logo_theater}/workspace/artifacts/logo/theater/build/master/mark.svg"
printf '%s\n' '#!/usr/bin/env bash' 'printf "{\\"ok\\":true,\\"findings\\":[]}\\n"' >"${logo_theater}/bin/node"
chmod +x "${logo_theater}/bin/node"
if HOME="${logo_theater}/home" PATH="${logo_theater}/bin:${PATH}" run_gate "${logo_case}" "${logo_theater}" >/dev/null 2>&1; then
  printf 'logo outcome gate accepted file-complete theater without independent visual evidence\n' >&2
  exit 1
fi

printf 'project outcome gate tests passed\n'
