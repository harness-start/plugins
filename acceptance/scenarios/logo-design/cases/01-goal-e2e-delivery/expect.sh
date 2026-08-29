#!/usr/bin/env bash
# Outcome-level logo gate: isolated install + release contract + independent visual evidence.
set -euo pipefail

REPO="${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}"
. "${REPO}/scripts/acceptance/lib/expect-helpers.sh"

require_host_session_started

notes="${ACCEPT_OUT}/quality-notes.md"
validation="${ACCEPT_OUT}/logo-validation.json"
: >"${notes}"
printf '# Logo outcome evidence\n\n- host: %s\n- workspace: %s\n\n' "${ACCEPT_HOST:-}" "${ACCEPT_WORKSPACE:-}" >>"${notes}"

fail=0
note() { printf '%s\n' "$*" | tee -a "${notes}" >&2; }
ok() { note "- PASS: $*"; }
bad() { note "- FAIL: $*"; fail=$((fail + 1)); }

if [ -s "${HOME}/install-all.log" ] && grep -Eq 'artifact-production' "${HOME}/install-all.log"; then
  ok "clean install catalog contains artifact-production"
else
  bad "install-all evidence for artifact-production is missing"
fi

logo_root="${ACCEPT_WORKSPACE}/artifacts/logo"
mapfile -t logo_ids < <(find "${logo_root}" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | sort || true)
if [ "${#logo_ids[@]}" -eq 0 ]; then
  bad "no artifacts/logo/<id> project was delivered"
fi

validator="${REPO}/plugins/artifact-production/dist/cli/harness.mjs"
for id in "${logo_ids[@]:-}"; do
  [ -n "${id}" ] || continue
  base="${logo_root}/${id}"
  stage="$(jq -r '.targetStage // "source"' "${base}/plan.contract.json" 2>/dev/null || printf source)"
  if [ "${stage}" != "release" ]; then
    bad "${id} stopped at ${stage}; release closure is required"
    continue
  fi

  set +e
  node "${validator}" logo validate "${base}" --stage release --json >"${validation}" 2>>"${notes}"
  probe_rc=$?
  set -e
  if [ "${probe_rc}" -eq 0 ] && jq -e '.ok == true and (.findings | length == 0)' "${validation}" >/dev/null 2>&1; then
    ok "${id} passes the shipped release validator with JSON exit semantics"
  else
    bad "${id} has release-contract findings"
    jq -r '.findings[]? | "  - [\(.code)] \(.path): \(.message)"' "${validation}" >>"${notes}" 2>/dev/null || true
  fi

  review="${base}/review.logo.json"
  if [ ! -s "${review}" ]; then
    bad "${id} is missing independent review.logo.json"
    continue
  fi
  if jq -e '
    . as $review
    | .schema == "brand-logo-production/review/v3"
    and .decision == "approved"
    and (.reviewer.kind == "human" or .reviewer.kind == "independent-agent")
    and (.reviewer.sessionId | type == "string" and length > 0)
    and (["brief-fidelity","concept-divergence","vector-craft","mono-reverse","scene-application","delivery-profile"]
      | all(. as $id | any($review.checks[]?; .id == $id and .status == "pass")))
    and (["structureConsistency","opticalCorrection","singleMemoryPoint","semanticIntegration","markWordmarkSystem","restraint"]
      | all(. as $id | ($review.criteria[$id].score == 2 and $review.criteria[$id].requiredMin >= 2 and ($review.criteria[$id].note | type == "string" and length >= 8))))
    and (.coverage | type == "array" and length > 0 and all(.[]; (.path | type == "string" and length > 0) and (.sha256 | test("^[a-f0-9]{64}$"))))
    and (.reviewerRetell.observedBeforeContract | type == "string" and length > 0)
    and (.reviewerRetell.intendedTarget | type == "string" and length > 0)
    and .reviewerRetell.alignment == "pass"
    and (["coreFidelity","signatureCue","semanticCausality","retellAlignment","invariantContinuity"]
      | all(. as $id | ($review.communicationReview[$id].status == "pass" and ($review.communicationReview[$id].anchor | type == "string" and length > 0) and ($review.communicationReview[$id].evidence | type == "string" and length > 0) and ($review.communicationReview[$id].recovery | type == "string" and length > 0))))
    and all(.findings[]?; ((.severity == "blocker" or .severity == "major") | not) or (.status == "verified" and (.recheckEvidence | type == "string" and length > 0)))
  ' "${review}" >/dev/null 2>&1; then
    ok "${id} has complete independent outcome checks, per-criterion scores, digest coverage, and finding recovery"
  else
    bad "${id} independent visual evidence is incomplete or below a required criterion"
  fi

  for rel in dist/presentation/specimen.png dist/presentation/application-mockup.png dist/integration/figma-import.json dist/print/production-notes.json; do
    if [ -s "${base}/${rel}" ]; then ok "${id} delivered ${rel}"; else bad "${id} missing ${rel}"; fi
  done

  {
    echo
    echo "## ${id} reviewer observations"
    jq -r '.criteria | to_entries[] | "- \(.key): score=\(.value.score), note=\(.value.note)"' "${review}" 2>/dev/null || true
    jq -r '.findings[]? | "- [\(.severity)] \(.findingId): \(.status) — \(.fix)"' "${review}" 2>/dev/null || true
  } >>"${notes}"
done

note "quality evidence written to ${notes}; failures=${fail}"
[ "${fail}" -eq 0 ]
