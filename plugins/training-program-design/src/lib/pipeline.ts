import { createHash } from "node:crypto";

import {
  MATERIAL_PATHS,
  RENDER_EVIDENCE_SCHEMA,
  REQUIRED_REVIEW_CRITERIA,
  REVIEW_INPUT_SCHEMA,
  REVIEW_SCHEMA,
  computeTrainingSubjectDigest,
  type ContractFinding,
  type JsonRecord,
  type TrainingModel,
} from "./contract.js";

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const isRecord = (value: unknown): value is JsonRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const strings = (value: unknown) => Array.isArray(value) ? value.filter(nonEmpty) : [];
const list = (items: string[]) => items.map((item) => `- ${item}`).join("\n");
const heading = (title: string) => `# ${title}\n`;

function packageOrThrow(model: TrainingModel) {
  if (!model.training || !model.plan) throw new Error("TRAINING_SOURCE_MISSING");
  return { training: model.training, plan: model.plan };
}

function renderBrief(model: TrainingModel) {
  const { training, plan } = packageOrThrow(model);
  const outcomes = (training.outcomes ?? []).map((outcome) => `- **${String(outcome.id)}** — ${String(outcome.statement)}\n  - Evidence: ${String(outcome.evidence)}`).join("\n");
  const variability = (training.audience?.variability ?? []).map((item) => `${String(item.dimension)}: ${String(item.evidence)}`);
  return `${heading(String(training.title))}\n## Training brief\n\n- Audience: ${String(plan.audience)}\n- Objective: ${String(plan.objective)}\n- Duration: ${String(plan.durationMinutes)} minutes\n- Modality: ${String(plan.modality)}\n- Language: ${String(plan.language)}\n- Mode: ${String(plan.mode)}\n\n## Audience starting point\n\n${String(training.audience?.sharedBaseline)}\n\n### Variability evidence\n\n${list(variability)}\n\n### Diagnostic\n\n${String(training.audience?.diagnostic)}\n\n## Learning outcomes\n\n${outcomes}\n`;
}

function renderFacilitatorGuide(model: TrainingModel) {
  const { training } = packageOrThrow(model);
  const activityById = new Map((training.activities ?? []).map((activity) => [String(activity.id), activity]));
  const blocks = (training.agenda ?? []).map((block) => {
    const activities = strings(block.activityIds).map((id) => activityById.get(id)).filter(Boolean).map((activity) => `### ${String(activity?.id)} — ${String(activity?.title)}\n\n**Common task**\n\n${String(activity?.commonTask)}\n\n**Entry supports**\n\n${list(strings(activity?.entrySupports))}\n\n**Stretch extensions**\n\n${list(strings(activity?.stretchExtensions))}\n\n**Facilitator moves**\n\n${list(strings(activity?.facilitatorMoves))}`).join("\n\n");
    return `## ${String(block.id)} — ${String(block.title)} (${String(block.durationMinutes)} min)\n\nOutcomes: ${strings(block.outcomeIds).join(", ")}\n\n${activities}`;
  }).join("\n\n");
  return `${heading(`${String(training.title)} — Facilitator guide`)}\n${blocks}\n`;
}

function renderLearnerWorkbook(model: TrainingModel) {
  const { training } = packageOrThrow(model);
  const outcomes = (training.outcomes ?? []).map((outcome) => `${String(outcome.id)}: ${String(outcome.statement)}`);
  const activities = (training.activities ?? []).map((activity) => `## ${String(activity.id)} — ${String(activity.title)}\n\n### Your task\n\n${String(activity.commonTask)}\n\n### Supports you may use\n\n${list(strings(activity.entrySupports))}\n\n### Stretch challenge\n\n${list(strings(activity.stretchExtensions))}\n\n### Your evidence\n\nRecord what you did, the result, and how you checked it.\n`).join("\n");
  return `${heading(`${String(training.title)} — Learner workbook`)}\n## What you will be able to do\n\n${list(outcomes)}\n\n${activities}`;
}

function renderPracticeAndAssessment(model: TrainingModel) {
  const { training } = packageOrThrow(model);
  const assessments = (training.assessments ?? []).map((assessment) => `## ${String(assessment.id)} — ${String(assessment.method)}\n\nOutcomes: ${strings(assessment.outcomeIds).join(", ")}\n\n### Success criteria\n\n${list(strings(assessment.criteria))}`).join("\n\n");
  const followUp = (training.followUp ?? []).map((item) => `${String(item.when)} — ${String(item.action)}`);
  return `${heading(`${String(training.title)} — Practice, assessment, and follow-up`)}\n${assessments}\n\n## Transfer after training\n\n${list(followUp)}\n`;
}

function renderSlideOutline(model: TrainingModel) {
  const { training } = packageOrThrow(model);
  const slides: string[] = [
    `## Slide 1 — Purpose and relevance\n\n- ${String(training.title)}\n- Shared starting point: ${String(training.audience?.sharedBaseline)}`,
    `## Slide 2 — Outcomes and evidence\n\n${list((training.outcomes ?? []).map((outcome) => `${String(outcome.id)}: ${String(outcome.statement)} — evidence: ${String(outcome.evidence)}`))}`,
  ];
  for (const [index, block] of (training.agenda ?? []).entries()) slides.push(`## Slide ${index + 3} — ${String(block.title)}\n\n- Time: ${String(block.durationMinutes)} minutes\n- Outcomes: ${strings(block.outcomeIds).join(", ")}\n- Activities: ${strings(block.activityIds).join(", ")}`);
  slides.push(`## Slide ${slides.length + 1} — Transfer commitment\n\n${list((training.followUp ?? []).map((item) => `${String(item.when)}: ${String(item.action)}`))}`);
  return `${heading(`${String(training.title)} — Slide outline`)}\n${slides.join("\n\n")}\n`;
}

function renderAdaptationReport(model: TrainingModel) {
  const { training } = packageOrThrow(model);
  const rows = (training.adaptationTrace ?? []).map((item) => `| ${String(item.source)} | ${String(item.action)} | ${String(item.reason)} |`).join("\n");
  return `${heading(`${String(training.title)} — Adaptation report`)}\n| Source element | Action | Reason |\n| --- | --- | --- |\n${rows}\n`;
}

export function renderTrainingMaterials(model: TrainingModel) {
  const outputs: Record<string, string> = {
    "dist/training-brief.md": renderBrief(model),
    "dist/facilitator-guide.md": renderFacilitatorGuide(model),
    "dist/learner-workbook.md": renderLearnerWorkbook(model),
    "dist/practice-and-assessment.md": renderPracticeAndAssessment(model),
    "dist/slide-outline.md": renderSlideOutline(model),
  };
  if (model.plan?.mode === "adapt") outputs["dist/adaptation-report.md"] = renderAdaptationReport(model);
  return outputs;
}

export function createRenderEvidence(model: TrainingModel) {
  const paths: string[] = [...MATERIAL_PATHS];
  if (model.plan?.mode === "adapt") paths.push("dist/adaptation-report.md");
  return {
    schema: RENDER_EVIDENCE_SCHEMA,
    plugin: "training-program-design",
    artifactId: model.artifactId,
    subjectDigest: computeTrainingSubjectDigest(model),
    outputs: Object.fromEntries(paths.map((path) => [path, model.digests?.[path] ?? sha256(model.files[path] ?? "")])),
  };
}

export function validateReviewInput(input: unknown): ContractFinding[] {
  const findings: ContractFinding[] = [];
  if (!isRecord(input) || input.schema !== REVIEW_INPUT_SCHEMA || !isRecord(input.reviewer) || !new Set(["agent", "human"]).has(String(input.reviewer.kind)) || !nonEmpty(input.reviewer.id) || !Array.isArray(input.criteria) || !Array.isArray(input.findings)) return [{ code: "REVIEW_INPUT_INVALID", path: "review-input.json", message: "review input requires schema, reviewer, criteria, and findings" }];
  const criteria = input.criteria.filter(isRecord);
  for (const id of REQUIRED_REVIEW_CRITERIA) if (!criteria.some((criterion) => criterion.id === id && typeof criterion.pass === "boolean" && nonEmpty(criterion.evidence))) findings.push({ code: "REVIEW_CRITERION_MISSING", path: "review-input.json", message: `review criterion ${id} requires pass/fail and evidence` });
  for (const [index, item] of input.findings.entries()) if (!isRecord(item) || !new Set(["blocking", "warning", "note"]).has(String(item.severity)) || !nonEmpty(item.anchor) || !nonEmpty(item.evidence) || !nonEmpty(item.fix)) findings.push({ code: "REVIEW_FINDING_INVALID", path: `review-input.json:findings:${index}`, message: "findings require severity, exact anchor, evidence, and fix" });
  return findings;
}

export function sealTrainingReview(model: TrainingModel, input: unknown, metadata: { sessionId?: string; triggerFrom?: string } = {}) {
  const findings = validateReviewInput(input);
  if (findings.length > 0) throw new Error(findings.map((item) => item.code).join(","));
  const record = input as JsonRecord;
  const criteria = record.criteria as JsonRecord[];
  const reviewFindings = record.findings as JsonRecord[];
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
    triggerFrom: metadata.triggerFrom ?? process.env.AI_EXPERTS_TRIGGER_FROM ?? "unknown",
  };
}
