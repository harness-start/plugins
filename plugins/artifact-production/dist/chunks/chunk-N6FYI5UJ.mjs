// harness-source-hash: sha256:aa55e37b578bd1016a6403462a3f72057de2a4fa7baa3013af84343c8e6ab3f1
import {
  MATERIAL_PATHS,
  RENDER_EVIDENCE_SCHEMA,
  REQUIRED_REVIEW_CRITERIA,
  REVIEW_INPUT_SCHEMA,
  REVIEW_SCHEMA,
  computeTrainingSubjectDigest
} from "./chunk-5DIPOQPP.mjs";

// plugins/artifact-production/src/domains/training/lib/pipeline.ts
import { createHash } from "node:crypto";
var sha256 = (value) => createHash("sha256").update(value).digest("hex");
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
var strings = (value) => Array.isArray(value) ? value.filter(nonEmpty) : [];
var list = (items) => items.map((item) => `- ${item}`).join("\n");
var heading = (title) => `# ${title}
`;
function packageOrThrow(model) {
  if (!model.training || !model.plan) throw new Error("TRAINING_SOURCE_MISSING");
  return { training: model.training, plan: model.plan };
}
function renderBrief(model) {
  const { training, plan } = packageOrThrow(model);
  const outcomes = (training.outcomes ?? []).map((outcome) => `- **${String(outcome.id)}** \u2014 ${String(outcome.statement)}
  - Evidence: ${String(outcome.evidence)}`).join("\n");
  const variability = (training.audience?.variability ?? []).map((item) => `${String(item.dimension)}: ${String(item.evidence)}`);
  return `${heading(String(training.title))}
## Training brief

- Audience: ${String(plan.audience)}
- Objective: ${String(plan.objective)}
- Duration: ${String(plan.durationMinutes)} minutes
- Modality: ${String(plan.modality)}
- Language: ${String(plan.language)}
- Mode: ${String(plan.mode)}

## Audience starting point

${String(training.audience?.sharedBaseline)}

### Variability evidence

${list(variability)}

### Diagnostic

${String(training.audience?.diagnostic)}

## Learning outcomes

${outcomes}
`;
}
function renderFacilitatorGuide(model) {
  const { training } = packageOrThrow(model);
  const activityById = new Map((training.activities ?? []).map((activity) => [String(activity.id), activity]));
  const blocks = (training.agenda ?? []).map((block) => {
    const activities = strings(block.activityIds).map((id) => activityById.get(id)).filter(Boolean).map((activity) => `### ${String(activity?.id)} \u2014 ${String(activity?.title)}

**Common task**

${String(activity?.commonTask)}

**Entry supports**

${list(strings(activity?.entrySupports))}

**Stretch extensions**

${list(strings(activity?.stretchExtensions))}

**Facilitator moves**

${list(strings(activity?.facilitatorMoves))}`).join("\n\n");
    return `## ${String(block.id)} \u2014 ${String(block.title)} (${String(block.durationMinutes)} min)

Outcomes: ${strings(block.outcomeIds).join(", ")}

${activities}`;
  }).join("\n\n");
  return `${heading(`${String(training.title)} \u2014 Facilitator guide`)}
${blocks}
`;
}
function renderLearnerWorkbook(model) {
  const { training } = packageOrThrow(model);
  const outcomes = (training.outcomes ?? []).map((outcome) => `${String(outcome.id)}: ${String(outcome.statement)}`);
  const activities = (training.activities ?? []).map((activity) => `## ${String(activity.id)} \u2014 ${String(activity.title)}

### Your task

${String(activity.commonTask)}

### Supports you may use

${list(strings(activity.entrySupports))}

### Stretch challenge

${list(strings(activity.stretchExtensions))}

### Your evidence

Record what you did, the result, and how you checked it.
`).join("\n");
  return `${heading(`${String(training.title)} \u2014 Learner workbook`)}
## What you will be able to do

${list(outcomes)}

${activities}`;
}
function renderPracticeAndAssessment(model) {
  const { training } = packageOrThrow(model);
  const assessments = (training.assessments ?? []).map((assessment) => `## ${String(assessment.id)} \u2014 ${String(assessment.method)}

Outcomes: ${strings(assessment.outcomeIds).join(", ")}

### Success criteria

${list(strings(assessment.criteria))}`).join("\n\n");
  const followUp = (training.followUp ?? []).map((item) => `${String(item.when)} \u2014 ${String(item.action)}`);
  return `${heading(`${String(training.title)} \u2014 Practice, assessment, and follow-up`)}
${assessments}

## Transfer after training

${list(followUp)}
`;
}
function renderSlideOutline(model) {
  const { training } = packageOrThrow(model);
  const slides = [
    `## Slide 1 \u2014 Purpose and relevance

- ${String(training.title)}
- Shared starting point: ${String(training.audience?.sharedBaseline)}`,
    `## Slide 2 \u2014 Outcomes and evidence

${list((training.outcomes ?? []).map((outcome) => `${String(outcome.id)}: ${String(outcome.statement)} \u2014 evidence: ${String(outcome.evidence)}`))}`
  ];
  for (const [index, block] of (training.agenda ?? []).entries()) slides.push(`## Slide ${index + 3} \u2014 ${String(block.title)}

- Time: ${String(block.durationMinutes)} minutes
- Outcomes: ${strings(block.outcomeIds).join(", ")}
- Activities: ${strings(block.activityIds).join(", ")}`);
  slides.push(`## Slide ${slides.length + 1} \u2014 Transfer commitment

${list((training.followUp ?? []).map((item) => `${String(item.when)}: ${String(item.action)}`))}`);
  return `${heading(`${String(training.title)} \u2014 Slide outline`)}
${slides.join("\n\n")}
`;
}
function renderAdaptationReport(model) {
  const { training } = packageOrThrow(model);
  const rows = (training.adaptationTrace ?? []).map((item) => `| ${String(item.source)} | ${String(item.action)} | ${String(item.reason)} |`).join("\n");
  return `${heading(`${String(training.title)} \u2014 Adaptation report`)}
| Source element | Action | Reason |
| --- | --- | --- |
${rows}
`;
}
function renderTrainingMaterials(model) {
  const outputs = {
    "dist/training-brief.md": renderBrief(model),
    "dist/facilitator-guide.md": renderFacilitatorGuide(model),
    "dist/learner-workbook.md": renderLearnerWorkbook(model),
    "dist/practice-and-assessment.md": renderPracticeAndAssessment(model),
    "dist/slide-outline.md": renderSlideOutline(model)
  };
  if (model.plan?.mode === "adapt") outputs["dist/adaptation-report.md"] = renderAdaptationReport(model);
  return outputs;
}
function createRenderEvidence(model) {
  const paths = [...MATERIAL_PATHS];
  if (model.plan?.mode === "adapt") paths.push("dist/adaptation-report.md");
  return {
    schema: RENDER_EVIDENCE_SCHEMA,
    plugin: "training-program-design",
    artifactId: model.artifactId,
    subjectDigest: computeTrainingSubjectDigest(model),
    outputs: Object.fromEntries(paths.map((path) => [path, model.digests?.[path] ?? sha256(model.files[path] ?? "")]))
  };
}
function validateReviewInput(input) {
  const findings = [];
  if (!isRecord(input) || input.schema !== REVIEW_INPUT_SCHEMA || !isRecord(input.reviewer) || !(/* @__PURE__ */ new Set(["agent", "human"])).has(String(input.reviewer.kind)) || !nonEmpty(input.reviewer.id) || !Array.isArray(input.criteria) || !Array.isArray(input.findings)) return [{ code: "REVIEW_INPUT_INVALID", path: "review-input.json", message: "review input requires schema, reviewer, criteria, and findings" }];
  const criteria = input.criteria.filter(isRecord);
  for (const id of REQUIRED_REVIEW_CRITERIA) if (!criteria.some((criterion) => criterion.id === id && typeof criterion.pass === "boolean" && nonEmpty(criterion.evidence))) findings.push({ code: "REVIEW_CRITERION_MISSING", path: "review-input.json", message: `review criterion ${id} requires pass/fail and evidence` });
  for (const [index, item] of input.findings.entries()) if (!isRecord(item) || !(/* @__PURE__ */ new Set(["blocking", "warning", "note"])).has(String(item.severity)) || !nonEmpty(item.anchor) || !nonEmpty(item.evidence) || !nonEmpty(item.fix)) findings.push({ code: "REVIEW_FINDING_INVALID", path: `review-input.json:findings:${index}`, message: "findings require severity, exact anchor, evidence, and fix" });
  return findings;
}
function sealTrainingReview(model, input, metadata = {}) {
  const findings = validateReviewInput(input);
  if (findings.length > 0) throw new Error(findings.map((item) => item.code).join(","));
  const record = input;
  const criteria = record.criteria;
  const reviewFindings = record.findings;
  const pass = criteria.every((criterion) => criterion.pass === true) && !reviewFindings.some((item) => item.severity === "blocking" && item.resolved !== true);
  return {
    schema: REVIEW_SCHEMA,
    plugin: "training-program-design",
    artifactId: model.artifactId,
    subjectDigest: computeTrainingSubjectDigest(model),
    verdict: pass ? "pass" : "revise",
    reviewer: record.reviewer,
    criteria,
    findings: reviewFindings,
    sessionId: metadata.sessionId ?? process.env.AI_EXPERTS_SESSION_ID ?? "unknown",
    triggerFrom: metadata.triggerFrom ?? process.env.AI_EXPERTS_TRIGGER_FROM ?? "unknown"
  };
}

export {
  renderTrainingMaterials,
  createRenderEvidence,
  sealTrainingReview
};
