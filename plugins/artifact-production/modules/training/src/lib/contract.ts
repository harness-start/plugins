import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, lstat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

export const PLAN_SCHEMA = "training-program-design/plan/v1";
export const PACKAGE_SCHEMA = "training-program-design/package/v1";
export const RENDER_EVIDENCE_SCHEMA = "training-program-design/render-evidence/v1";
export const REVIEW_INPUT_SCHEMA = "training-program-design/review-input/v1";
export const REVIEW_SCHEMA = "training-program-design/review/v1";
export const RECEIPT_SCHEMA = "training-program-design/receipt/v1";

export const TRAINING_STAGES = ["brief", "design", "materials", "review", "release"] as const;
export type TrainingStage = (typeof TRAINING_STAGES)[number];
const STAGES = new Set<string>(TRAINING_STAGES);
const STAGE_RANK = Object.fromEntries(TRAINING_STAGES.map((stage, index) => [stage, index])) as Record<TrainingStage, number>;

export const REQUIRED_REVIEW_CRITERIA = [
  "alignment",
  "audience-variability",
  "practice",
  "assessment",
  "facilitation",
  "material-consistency",
  "transfer",
] as const;

export const MATERIAL_PATHS = [
  "dist/training-brief.md",
  "dist/facilitator-guide.md",
  "dist/learner-workbook.md",
  "dist/practice-and-assessment.md",
  "dist/slide-outline.md",
] as const;

export type JsonRecord = Record<string, unknown>;
export type ContractFinding = { code: string; path: string; message: string };
export type FileMap = Record<string, string>;

export type TrainingPlan = {
  schema?: unknown;
  artifactId?: unknown;
  mode?: unknown;
  targetStage?: unknown;
  audience?: unknown;
  objective?: unknown;
  durationMinutes?: unknown;
  modality?: unknown;
  language?: unknown;
  assumptions?: unknown;
};

export type TrainingPackage = {
  schema?: unknown;
  title?: unknown;
  audience?: {
    sharedBaseline?: unknown;
    variability?: Array<{ dimension?: unknown; evidence?: unknown }>;
    diagnostic?: unknown;
  };
  outcomes?: Array<{ id?: unknown; statement?: unknown; evidence?: unknown }>;
  agenda?: Array<{ id?: unknown; title?: unknown; durationMinutes?: unknown; outcomeIds?: unknown; activityIds?: unknown }>;
  activities?: Array<{
    id?: unknown;
    title?: unknown;
    outcomeIds?: unknown;
    commonTask?: unknown;
    entrySupports?: unknown;
    stretchExtensions?: unknown;
    facilitatorMoves?: unknown;
  }>;
  assessments?: Array<{ id?: unknown; outcomeIds?: unknown; method?: unknown; criteria?: unknown }>;
  followUp?: Array<{ when?: unknown; action?: unknown }>;
  sources?: unknown;
  adaptationTrace?: Array<{ source?: unknown; action?: unknown; reason?: unknown }>;
};

export type TrainingModel = {
  artifactId: string;
  root?: string;
  plan?: TrainingPlan;
  training?: TrainingPackage;
  files: FileMap;
  digests?: Record<string, string>;
};

export type TrainingReceipt = {
  schema: string;
  plugin: string;
  artifactId: string;
  stage: "release";
  subjectDigest: string;
  outputs: Record<string, string>;
};

const finding = (code: string, path: string, message: string): ContractFinding => ({ code, path, message });
const isRecord = (value: unknown): value is JsonRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const stringArray = (value: unknown): string[] | null => Array.isArray(value) && value.every(nonEmpty) ? value : null;
const kebab = (value: unknown) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function fileDigest(model: TrainingModel, path: string) {
  return model.digests?.[path] ?? sha256(model.files[path] ?? "");
}

export function computeTrainingSubjectDigest(model: TrainingModel | null | undefined) {
  const plan = model?.plan ? { ...model.plan } : null;
  if (plan) delete plan.targetStage;
  return sha256(stableJson({ plan, training: model?.training ?? null }));
}

function stageAtLeast(stage: TrainingStage, expected: TrainingStage) {
  return STAGE_RANK[stage] >= STAGE_RANK[expected];
}

function validatePlan(model: TrainingModel, findings: ContractFinding[]) {
  const plan = model.plan;
  if (!plan) {
    findings.push(finding("REQUIRED_PATH_MISSING", "plan.contract.json", "plan.contract.json is required"));
    return;
  }
  if (plan.schema !== PLAN_SCHEMA) findings.push(finding("PLAN_SCHEMA_INVALID", "plan.contract.json", `schema must be ${PLAN_SCHEMA}`));
  if (!kebab(plan.artifactId) || plan.artifactId !== model.artifactId) findings.push(finding("ARTIFACT_ID_INVALID", "plan.contract.json", "artifactId must match the kebab-case project directory"));
  if (!new Set(["design", "adapt"]).has(String(plan.mode))) findings.push(finding("MODE_INVALID", "plan.contract.json", "mode must be design or adapt"));
  if (!STAGES.has(String(plan.targetStage))) findings.push(finding("TARGET_STAGE_INVALID", "plan.contract.json", "targetStage must be brief, design, materials, review, or release"));
  for (const field of ["audience", "objective", "modality", "language"] as const) {
    if (!nonEmpty(plan[field])) findings.push(finding("PLAN_FIELD_REQUIRED", `plan.contract.json:${field}`, `${field} is required`));
  }
  if (!Number.isInteger(plan.durationMinutes) || Number(plan.durationMinutes) <= 0) findings.push(finding("DURATION_INVALID", "plan.contract.json:durationMinutes", "durationMinutes must be a positive integer"));
  if (!Array.isArray(plan.assumptions) || !plan.assumptions.every((item) => typeof item === "string")) findings.push(finding("ASSUMPTIONS_INVALID", "plan.contract.json:assumptions", "assumptions must be an array of strings"));
}

function uniqueIds(items: unknown, path: string, findings: ContractFinding[]) {
  if (!Array.isArray(items) || items.length === 0) {
    findings.push(finding("COLLECTION_REQUIRED", path, `${path} must be a non-empty array`));
    return new Set<string>();
  }
  const ids = new Set<string>();
  for (const [index, item] of items.entries()) {
    const id = isRecord(item) ? item.id : undefined;
    if (!nonEmpty(id)) findings.push(finding("ID_INVALID", `${path}:${index}`, "item id must be a non-empty string"));
    else if (ids.has(id)) findings.push(finding("ID_DUPLICATE", `${path}:${index}`, `duplicate id: ${id}`));
    else ids.add(id);
  }
  return ids;
}

function validateReferences(value: unknown, known: Set<string>, path: string, findings: ContractFinding[]) {
  const references = stringArray(value);
  if (!references?.length) {
    findings.push(finding("OUTCOME_MAPPING_REQUIRED", path, "at least one outcome id is required"));
    return [];
  }
  for (const reference of references) if (!known.has(reference)) findings.push(finding("OUTCOME_REFERENCE_INVALID", path, `unknown outcome id: ${reference}`));
  return references;
}

function validatePackage(model: TrainingModel, findings: ContractFinding[]) {
  const training = model.training;
  if (!training) {
    findings.push(finding("REQUIRED_PATH_MISSING", "training-package.json", "training-package.json is required"));
    return;
  }
  if (training.schema !== PACKAGE_SCHEMA) findings.push(finding("PACKAGE_SCHEMA_INVALID", "training-package.json", `schema must be ${PACKAGE_SCHEMA}`));
  if (!nonEmpty(training.title)) findings.push(finding("PACKAGE_FIELD_REQUIRED", "training-package.json:title", "title is required"));
  const audience = training.audience;
  if (!audience || !nonEmpty(audience.sharedBaseline) || !nonEmpty(audience.diagnostic) || !Array.isArray(audience.variability) || audience.variability.length === 0) {
    findings.push(finding("AUDIENCE_PROFILE_INVALID", "training-package.json:audience", "audience requires a shared baseline, variability evidence, and diagnostic"));
  }
  for (const [index, item] of (audience?.variability ?? []).entries()) {
    if (!nonEmpty(item.dimension) || !nonEmpty(item.evidence)) findings.push(finding("AUDIENCE_VARIABILITY_INVALID", `training-package.json:audience:variability:${index}`, "each audience variability dimension requires concrete evidence"));
  }
  const outcomeIds = uniqueIds(training.outcomes, "training-package.json:outcomes", findings);
  const activityIds = uniqueIds(training.activities, "training-package.json:activities", findings);
  const activitiesById = new Map((training.activities ?? []).filter((item) => nonEmpty(item.id)).map((item) => [String(item.id), item]));
  uniqueIds(training.agenda, "training-package.json:agenda", findings);
  uniqueIds(training.assessments, "training-package.json:assessments", findings);
  const practised = new Set<string>();
  const assessed = new Set<string>();

  for (const [index, outcome] of (training.outcomes ?? []).entries()) {
    if (!nonEmpty(outcome.statement) || !nonEmpty(outcome.evidence)) findings.push(finding("OUTCOME_INVALID", `training-package.json:outcomes:${index}`, "each outcome requires a measurable statement and evidence"));
  }
  for (const [index, activity] of (training.activities ?? []).entries()) {
    const refs = validateReferences(activity.outcomeIds, outcomeIds, `training-package.json:activities:${index}:outcomeIds`, findings);
    refs.forEach((id) => practised.add(id));
    if (!nonEmpty(activity.commonTask)) findings.push(finding("COMMON_TASK_REQUIRED", `training-package.json:activities:${index}`, "every activity requires one common task"));
    if (!stringArray(activity.entrySupports)?.length || !stringArray(activity.stretchExtensions)?.length) findings.push(finding("VARIABILITY_DESIGN_REQUIRED", `training-package.json:activities:${index}`, "every activity requires entry supports and stretch extensions around the common task"));
    if (!stringArray(activity.facilitatorMoves)?.length) findings.push(finding("FACILITATOR_MOVES_REQUIRED", `training-package.json:activities:${index}`, "facilitator moves are required"));
  }
  for (const [index, assessment] of (training.assessments ?? []).entries()) {
    const refs = validateReferences(assessment.outcomeIds, outcomeIds, `training-package.json:assessments:${index}:outcomeIds`, findings);
    refs.forEach((id) => assessed.add(id));
    if (!nonEmpty(assessment.method) || !stringArray(assessment.criteria)?.length) findings.push(finding("ASSESSMENT_INVALID", `training-package.json:assessments:${index}`, "each assessment requires a method and observable criteria"));
  }
  let minutes = 0;
  for (const [index, block] of (training.agenda ?? []).entries()) {
    const duration = Number(block.durationMinutes);
    if (!Number.isInteger(duration) || duration <= 0) findings.push(finding("AGENDA_DURATION_INVALID", `training-package.json:agenda:${index}`, "agenda duration must be a positive integer"));
    else minutes += duration;
    const blockOutcomes = validateReferences(block.outcomeIds, outcomeIds, `training-package.json:agenda:${index}:outcomeIds`, findings);
    const refs = stringArray(block.activityIds);
    if (!refs?.length) findings.push(finding("ACTIVITY_MAPPING_REQUIRED", `training-package.json:agenda:${index}:activityIds`, "agenda block must reference an activity"));
    else {
      const scheduledOutcomes = new Set<string>();
      for (const id of refs) {
        if (!activityIds.has(id)) findings.push(finding("ACTIVITY_REFERENCE_INVALID", `training-package.json:agenda:${index}:activityIds`, `unknown activity id: ${id}`));
        for (const outcomeId of stringArray(activitiesById.get(id)?.outcomeIds) ?? []) scheduledOutcomes.add(outcomeId);
      }
      for (const outcomeId of blockOutcomes) if (!scheduledOutcomes.has(outcomeId)) findings.push(finding("AGENDA_ACTIVITY_OUTCOME_MISMATCH", `training-package.json:agenda:${index}`, `agenda outcome ${outcomeId} is not practised by its scheduled activities`));
    }
  }
  if (minutes !== Number(model.plan?.durationMinutes)) findings.push(finding("AGENDA_DURATION_MISMATCH", "training-package.json:agenda", `agenda totals ${minutes} minutes but plan requires ${String(model.plan?.durationMinutes)}`));
  for (const id of outcomeIds) {
    if (!practised.has(id)) findings.push(finding("OUTCOME_PRACTICE_MISSING", `training-package.json:outcomes:${id}`, "every outcome must be practised"));
    if (!assessed.has(id)) findings.push(finding("OUTCOME_ASSESSMENT_MISSING", `training-package.json:outcomes:${id}`, "every outcome must be assessed"));
  }
  if (!Array.isArray(training.followUp) || training.followUp.length === 0 || training.followUp.some((item) => !nonEmpty(item.when) || !nonEmpty(item.action))) findings.push(finding("FOLLOW_UP_REQUIRED", "training-package.json:followUp", "at least one timed transfer action is required"));
  if (model.plan?.mode === "adapt" && (!Array.isArray(training.adaptationTrace) || training.adaptationTrace.length === 0 || training.adaptationTrace.some((item) => !nonEmpty(item.source) || !new Set(["retain", "modify", "remove"]).has(String(item.action)) || !nonEmpty(item.reason)))) findings.push(finding("ADAPTATION_TRACE_REQUIRED", "training-package.json:adaptationTrace", "adapt mode requires source, retain|modify|remove action, and reason"));
}

function parseFile(model: TrainingModel, path: string): JsonRecord | undefined {
  const value = model.files[path];
  if (typeof value !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function validateMaterials(model: TrainingModel, findings: ContractFinding[]) {
  const expected: string[] = [...MATERIAL_PATHS];
  if (model.plan?.mode === "adapt") expected.push("dist/adaptation-report.md");
  for (const path of expected) if (!nonEmpty(model.files[path])) findings.push(finding("MATERIAL_MISSING", path, `${path} must be generated`));
  const evidence = parseFile(model, "evidence.render.json");
  if (!evidence || evidence.schema !== RENDER_EVIDENCE_SCHEMA || evidence.artifactId !== model.artifactId || evidence.subjectDigest !== computeTrainingSubjectDigest(model) || !isRecord(evidence.outputs)) {
    findings.push(finding("RENDER_EVIDENCE_INVALID", "evidence.render.json", "render evidence must bind current sources and outputs"));
    return;
  }
  for (const path of expected) if (evidence.outputs[path] !== fileDigest(model, path)) findings.push(finding("RENDER_OUTPUT_STALE", path, "rendered material digest does not match evidence"));
}

function validateReview(model: TrainingModel, findings: ContractFinding[]) {
  const review = parseFile(model, "review.training.json");
  if (!review || review.schema !== REVIEW_SCHEMA || review.artifactId !== model.artifactId || review.subjectDigest !== computeTrainingSubjectDigest(model) || review.verdict !== "pass" || !Array.isArray(review.criteria)) {
    findings.push(finding("REVIEW_INVALID", "review.training.json", "review must pass and bind current sources"));
    return;
  }
  const criteria = review.criteria.filter(isRecord);
  for (const id of REQUIRED_REVIEW_CRITERIA) if (!criteria.some((criterion) => criterion.id === id && criterion.pass === true && nonEmpty(criterion.evidence))) findings.push(finding("REVIEW_CRITERION_MISSING", "review.training.json", `passing evidence is required for ${id}`));
  if (Array.isArray(review.findings) && review.findings.some((item) => isRecord(item) && item.severity === "blocking" && item.resolved !== true)) findings.push(finding("REVIEW_BLOCKING_FINDING", "review.training.json", "blocking review findings must be resolved"));
}

export function createTrainingReceipt(model: TrainingModel): TrainingReceipt {
  const outputs = Object.keys(model.files)
    .filter((path) => path.startsWith("dist/") || path === "evidence.render.json" || path === "review.training.json")
    .sort();
  return {
    schema: RECEIPT_SCHEMA,
    plugin: "training-program-design",
    artifactId: model.artifactId,
    stage: "release",
    subjectDigest: computeTrainingSubjectDigest(model),
    outputs: Object.fromEntries(outputs.map((path) => [path, fileDigest(model, path)])),
  };
}

function validateRelease(model: TrainingModel, findings: ContractFinding[]) {
  const receipt = parseFile(model, "receipt.release.json");
  const expected = createTrainingReceipt(model);
  if (!receipt || stableJson(receipt) !== stableJson(expected)) findings.push(finding("RECEIPT_INVALID", "receipt.release.json", "release receipt must bind current sources, review, evidence, and outputs"));
}

export function validateTrainingModel(model: TrainingModel | null | undefined, { stage = "brief" }: { stage?: unknown } = {}) {
  if (typeof stage !== "string" || !STAGES.has(stage)) return [finding("STAGE_INVALID", "plan.contract.json", `unsupported training stage: ${String(stage)}`)];
  const currentStage = stage as TrainingStage;
  const current = model ?? { artifactId: "", files: {} };
  const findings: ContractFinding[] = [];
  if (".training-delivery-journal.json" in current.files) findings.push(finding("MUTATION_JOURNAL_OPEN", ".training-delivery-journal.json", "an interrupted writer must be recovered"));
  validatePlan(current, findings);
  if (stageAtLeast(currentStage, "design")) validatePackage(current, findings);
  if (stageAtLeast(currentStage, "materials")) validateMaterials(current, findings);
  if (stageAtLeast(currentStage, "review")) validateReview(current, findings);
  if (stageAtLeast(currentStage, "release")) validateRelease(current, findings);
  return findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));
}

export type TrainingWriteDecision = { decision: "allow" } | { decision: "deny"; code: string; message: string };
const GENERATED_PATH = /^(?:dist\/|evidence\.|review\.training\.json$|receipt\.release\.json$|\.training-delivery-journal\.json$|\.tmp\/training-guard\/)/u;

export function evaluateTrainingWrite({ relativePath = "", toolName = "", writer = "", cwd = "." }: { relativePath?: string; toolName?: string; writer?: string; cwd?: string } = {}): TrainingWriteDecision {
  const normalized = resolve(cwd, relativePath).replaceAll("\\", "/");
  const marker = "/artifacts/training/";
  const offset = normalized.indexOf(marker);
  if (offset < 0) return { decision: "allow" };
  const inside = normalized.slice(offset + marker.length).split("/").slice(1).join("/");
  if (GENERATED_PATH.test(inside) && !/^training-(?:render|review|release)$/u.test(writer)) return { decision: "deny", code: "PROTECTED_WRITER_REQUIRED", message: `${inside} must be written by a registered training-program-design writer, not ${toolName || "an unregistered tool"}` };
  return { decision: "allow" };
}

export function resolveWorkspaceRoot(cwd: string) {
  const absolute = resolve(cwd);
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: absolute, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (root) return resolve(root);
  } catch {}
  const parts = absolute.split(sep);
  for (let index = parts.length - 3; index >= 0; index -= 1) if (parts[index] === "artifacts" && parts[index + 1] === "training") return resolve(parts.slice(0, index).join(sep) || sep);
  return absolute;
}

export function isTrainingProjectRoot(projectRoot: string, workspaceRoot: string) {
  return dirname(resolve(projectRoot)) === join(resolve(workspaceRoot), "artifacts", "training") && kebab(basename(projectRoot));
}

export async function loadTrainingProject(projectRoot: string): Promise<TrainingModel> {
  const root = resolve(projectRoot);
  const files: FileMap = {};
  const digests: Record<string, string> = {};
  async function collect(directory: string, depth = 0): Promise<void> {
    if (depth > 4) throw new Error("PROJECT_DEPTH_LIMIT_EXCEEDED");
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const path = relative(root, absolute).replaceAll("\\", "/");
      if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${path}`);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".git") await collect(absolute, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = await lstat(absolute);
      if (stat.size > 4 * 1024 * 1024) throw new Error(`FILE_SIZE_LIMIT_EXCEEDED:${path}`);
      const bytes = await readFile(absolute);
      files[path] = bytes.toString("utf8");
      digests[path] = sha256(bytes);
    }
  }
  await collect(root);
  const parse = (path: string) => {
    try { return JSON.parse(files[path] ?? "") as JsonRecord; } catch { return undefined; }
  };
  const plan = parse("plan.contract.json") as TrainingPlan | undefined;
  const training = parse("training-package.json") as TrainingPackage | undefined;
  return {
    artifactId: basename(root),
    root,
    files,
    digests,
    ...(plan ? { plan } : {}),
    ...(training ? { training } : {}),
  };
}

export async function findTrainingProjects(cwd: string, { maxProjects = 32 } = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const carrierRoot = join(workspaceRoot, "artifacts", "training");
  let entries;
  try { entries = await readdir(carrierRoot, { withFileTypes: true }); } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return [];
    throw error;
  }
  const roots: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:artifacts/training/${entry.name}`);
    if (!entry.isDirectory() || !kebab(entry.name)) continue;
    const root = join(carrierRoot, entry.name);
    try { if ((await lstat(join(root, "plan.contract.json"))).isFile()) roots.push(root); } catch (error) { if (!(isRecord(error) && error.code === "ENOENT")) throw error; }
    if (roots.length > maxProjects) throw new Error("PROJECT_COUNT_LIMIT_EXCEEDED");
  }
  return roots.sort();
}
