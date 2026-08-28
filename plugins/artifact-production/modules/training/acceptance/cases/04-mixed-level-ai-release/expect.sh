#!/usr/bin/env bash
set -euo pipefail
. "${ACCEPT_REPO:-$(cd "$(dirname "$0")/../../../../.." && pwd)}/scripts/acceptance/lib/expect-helpers.sh"
require_host_session_started
project="${ACCEPT_WORKSPACE}/artifacts/training/ai-workflow-foundations"
for path in \
  plan.contract.json \
  training-package.json \
  dist/training-brief.md \
  dist/facilitator-guide.md \
  dist/learner-workbook.md \
  dist/practice-and-assessment.md \
  dist/slide-outline.md \
  evidence.render.json \
  review.training.json \
  receipt.release.json; do
  require_file_exists "${project}/${path}"
done
node "${ACCEPT_REPO}/plugins/training-program-design/dist/cli/project-lint.mjs" "${project}" --stage release >/dev/null
jq -e '
  .targetStage == "release"
  and .durationMinutes == 90
  and .language == "zh-CN"
' "${project}/plan.contract.json" >/dev/null
jq -e '
  . as $package
  |
  (.audience.variability | length) >= 1
  and (.outcomes | length) >= 2
  and all(.activities[]; (.entrySupports | length) > 0 and (.stretchExtensions | length) > 0 and (.facilitatorMoves | length) > 0)
  and all(.outcomes[]; .id as $id | any($package.activities[]; (.outcomeIds | index($id)) != null))
  and all(.outcomes[]; .id as $id | any($package.assessments[]; (.outcomeIds | index($id)) != null))
  and any(.followUp[]; (.when | test("一周|one week|7[[:space:]]*天|第[[:space:]]*7[[:space:]]*天"; "i")))
' "${project}/training-package.json" >/dev/null
jq -e '.verdict == "pass" and (.criteria | length) >= 7' "${project}/review.training.json" >/dev/null
jq -e '.stage == "release" and (.outputs | length) >= 7' "${project}/receipt.release.json" >/dev/null
if grep -R -n 'TODO' "${project}"; then
  echo "expect fail: placeholders remain" >&2
  exit 1
fi
grep -q 'Dify' "${project}/dist/training-brief.md" "${project}/dist/facilitator-guide.md"
grep -q 'LLM' "${project}/dist/training-brief.md" "${project}/dist/learner-workbook.md"
grep -q 'DeepSeek' "${project}/dist/training-brief.md" "${project}/dist/learner-workbook.md"
echo "OK mixed-level AI training reached a source-bound reviewed release"
