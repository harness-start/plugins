import { createHash } from "node:crypto";
import { projectInside } from "@harness/core/artifact-paths";

const GENERATED_PATH = /^(?:plan\.contract\.json$|build\/|proofs\/|dist\/|evidence(?:\.|\/)|review\.music\.json$|release\.manifest\.json$|receipt\.release\.json$|\.music-delivery-journal\.json$)/u;
const SUBJECT_EXCLUDED_PATH = /^(?:plan\.contract\.json$|build\/|proofs\/|dist\/|evidence(?:\.|\/)|review\.music\.json$|release\.manifest\.json$|receipt\.release\.json$|review\/|\.music-delivery-journal\.json$)/u;
const COMPOSITION_OWNER_VIOLATION = /(?:\b(?:fetch|XMLHttpRequest|WebSocket|Date\.now|Math\.random)\b|https?:\/\/|Tone\.(?:Offline|Recorder|start)\b|getTransport\(\)\.(?:start|stop)\s*\()/u;
const INSTRUMENT_OWNER_VIOLATION = /(?:\b(?:fetch|XMLHttpRequest|WebSocket|Date\.now|Math\.random)\b|https?:\/\/|\.toDestination\s*\(|Tone\.(?:Offline|Recorder|start)\b|getTransport\(\)\.(?:start|stop)\s*\()/u;
const ROLE = /^(?:bass|drums|fx|harmony|melody|texture)$/u;
export const MUSIC_ENGINE = "music-project-delivery-guard@0.3.0";
export const PLAN_SCHEMA = "music-project-delivery-guard/plan/v1";
export const BRIEF_SCHEMA = "music-project-delivery-guard/brief/v1";
export const DIRECTION_SCHEMA = "music-project-delivery-guard/direction/v1";
export const ARRANGEMENT_SCHEMA = "music-project-delivery-guard/arrangement/v1";
export const SKILL_COMPOSITION_SCHEMA = "music-project-delivery-guard/skill-composition/v1";
export const SKILL_ADVICE_INPUT_SCHEMA = "music-project-delivery-guard/advice-input/v1";
export const SKILL_ADVICE_SCHEMA = "music-project-delivery-guard/advice/v1";
export const PREVIEW_SCHEMA = "music-project-delivery-guard/preview/v1";
export const REVIEW_INPUT_SCHEMA = "music-project-delivery-guard/review-input/v1";
export const REVIEW_SCHEMA = "music-project-delivery-guard/review/v1";
export const PROJECT_SCHEMA = "music-project-delivery-guard/project/v1";

export const EXTERNAL_SKILLS = [
  { name: "music-composition", revision: "07cecf9c8fd15249ea3da311dc9a7c7893ff801f", ecosystem: "en", mode: "adviser", phases: ["brief", "direction", "composition", "arrangement"] },
  { name: "miaoxiang-music", revision: "1447ff68be4a544a61354377592f345a9216ff1f", ecosystem: "zh", mode: "reference-only", phases: ["brief", "direction", "arrangement"] },
  { name: "workflow-audio-production", revision: "5014c1e8b23fd3e18d49926d9aa147d15a3aa08e", ecosystem: "en", mode: "reference-only", phases: ["arrangement", "render", "preview"] },
  { name: "workflow-analysis-quality", revision: "5014c1e8b23fd3e18d49926d9aa147d15a3aa08e", ecosystem: "en", mode: "reference-only", phases: ["preview", "review"] },
] as const;

export type MusicFinding = {
  code: string;
  path: string;
  message: string;
};

export type MusicFileMap = Record<string, string | undefined>;

export type MusicTrackConfig = {
  index?: number;
  id?: string;
  role?: string;
  instrument?: string;
  motif?: string;
  octave?: number;
  sections?: string[];
};

export type MusicQualityConfig = {
  maxPeakDbfs?: number;
  minRmsDbfs?: number;
  maxAbsDcOffset?: number;
  maxClippedSamples?: number;
};

export type MusicProjectConfig = {
  schema?: string;
  artifactId?: string;
  sampleRate?: number;
  channels?: number;
  tailSeconds?: number;
  quality?: MusicQualityConfig;
  tracks?: MusicTrackConfig[];
};

export type MusicModel = {
  artifactId?: string;
  files?: MusicFileMap;
  digests?: Record<string, string>;
  plan?: unknown;
  project?: MusicProjectConfig | null;
};

export type MusicWriteDecision =
  | { decision: "allow" }
  | { decision: "deny"; code: string; message: string };

const sha256 = (value: string | NodeJS.ArrayBufferView) => createHash("sha256").update(value).digest("hex");
const finding = (code: string, path: string, message: string): MusicFinding => ({ code, path, message });
const digestFor = (model: MusicModel, filePath: string) => model.digests?.[filePath] ?? sha256(model.files?.[filePath] ?? "");

export function computeMusicSubjectDigest(model: MusicModel) {
  const records = Object.entries(model?.files ?? {})
    .filter(([filePath, value]) => typeof value === "string" && !SUBJECT_EXCLUDED_PATH.test(filePath))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath]) => `${filePath}\0${digestFor(model, filePath)}\n`)
    .join("");
  return sha256(`${MUSIC_ENGINE}\n${records}`);
}

export function musicSourcePaths(model: MusicModel) {
  const subjectDigest = computeMusicSubjectDigest(model);
  const tracks = Array.isArray(model?.project?.tracks) ? model.project.tracks : [];
  return {
    subjectDigest,
    score: `build/score.${subjectDigest}.json`,
    metrics: `build/metrics.${subjectDigest}.json`,
    renderReceipt: `build/render.${subjectDigest}.json`,
    mix: `build/mix.${subjectDigest}.wav`,
    proofs: tracks.map((track) => `proofs/t${String(track.index).padStart(3, "0")}-${track.role}-${track.id}.${subjectDigest}.wav`),
    preview: `evidence/preview.${subjectDigest}.json`,
  };
}

function releaseOutputPaths(model: MusicModel) {
  return [
    `dist/${model.artifactId}.wav`,
    "evidence.audio.json",
    "review.music.json",
    "release.manifest.json",
  ];
}

export function createMusicReceipt(model: MusicModel) {
  const { subjectDigest } = musicSourcePaths(model);
  return {
    schemaVersion: 2,
    plugin: "music-project-delivery-guard",
    engine: MUSIC_ENGINE,
    artifactId: model?.artifactId,
    stage: "release",
    subjectDigest,
    outputs: Object.fromEntries(releaseOutputPaths(model).map((filePath) => [filePath, digestFor(model, filePath)])),
  };
}

export function validateMusicReceipt(model: MusicModel) {
  try {
    const actual: unknown = JSON.parse(model.files?.["receipt.release.json"] ?? "");
    const expected = createMusicReceipt(model);
    if (typeof actual !== "object" || actual === null) return false;
    const record = actual as Record<string, unknown>;
    return record.schemaVersion === expected.schemaVersion
      && record.plugin === expected.plugin
      && record.engine === expected.engine
      && record.artifactId === expected.artifactId
      && record.stage === expected.stage
      && record.subjectDigest === expected.subjectDigest
      && JSON.stringify(record.outputs) === JSON.stringify(expected.outputs);
  } catch {
    return false;
  }
}

function parseJson(files: MusicFileMap | undefined, filePath: string, findings: MusicFinding[]): unknown {
  const text = files?.[filePath];
  if (typeof text !== "string") {
    findings.push(finding("REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    findings.push(finding("JSON_INVALID", filePath, `${filePath} must contain valid JSON`));
    return null;
  }
}

function validateRequired(files: MusicFileMap, findings: MusicFinding[]) {
  for (const filePath of [
    ".gitignore",
    "package.json",
    "package-lock.json",
    "plan.contract.json",
    "music.project.json",
    "src/composition.mjs",
  ]) {
    if (!(filePath in files)) findings.push(finding("REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
  }
}

function validateGitignore(files: MusicFileMap, findings: MusicFinding[]) {
  const text = files[".gitignore"];
  if (typeof text !== "string") return;
  text.split(/\r?\n/u).forEach((raw, offset) => {
    const line = raw.trim().replace(/^\//u, "");
    if (line && !line.startsWith("#") && !line.startsWith("!") && /^(?:build|proofs|dist|review|evidence|release|receipt)(?:\/|\.|$)/u.test(line)) {
      findings.push(finding("DELIVERY_PATH_IGNORED", `.gitignore:${offset + 1}`, `artifact delivery path must not be ignored: ${raw.trim()}`));
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatePlan(model: MusicModel, findings: MusicFinding[]) {
  const files = model.files ?? {};
  const plan = parseJson(files, "plan.contract.json", findings);
  if (!plan) return;
  const record = isRecord(plan) ? plan : {};
  if (record.schema !== PLAN_SCHEMA) findings.push(finding("PLAN_SCHEMA_INVALID", "plan.contract.json", `plan schema must be ${PLAN_SCHEMA}`));
  if (record.artifactId !== model.artifactId) findings.push(finding("PLAN_ARTIFACT_MISMATCH", "plan.contract.json", "plan artifactId must match the music project directory"));
  if (record.targetStage !== "source" && record.targetStage !== "release") findings.push(finding("PLAN_STAGE_INVALID", "plan.contract.json", "targetStage must be source or release"));
}

function nonEmptyString(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "string" && String(record[key]).trim().length > 0;
}

function nonEmptyList(record: Record<string, unknown>, key: string) {
  return Array.isArray(record[key]) && (record[key] as unknown[]).length > 0;
}

function validatePlanning(model: MusicModel, findings: MusicFinding[]) {
  const files = model.files ?? {};
  const briefValue = parseJson(files, "plan.brief.json", findings);
  const brief = isRecord(briefValue) ? briefValue : {};
  if (brief.schema !== BRIEF_SCHEMA || brief.artifactId !== model.artifactId
    || !["language", "audience", "useCase", "mood", "genre"].every((key) => nonEmptyString(brief, key))
    || !Number.isFinite(brief.durationSeconds) || Number(brief.durationSeconds) <= 0
    || !["referenceTraits", "structure", "instrumentation", "constraints", "prohibitedDirections", "successCriteria"].every((key) => nonEmptyList(brief, key))) {
    findings.push(finding("BRIEF_INVALID", "plan.brief.json", "brief must bind the project and define audience, use, duration, musical intent, constraints, prohibited directions, and success criteria"));
  }
  const directionValue = parseJson(files, "plan.direction.json", findings);
  const direction = isRecord(directionValue) ? directionValue : {};
  if (direction.schema !== DIRECTION_SCHEMA || direction.artifactId !== model.artifactId
    || !["tonalCenter", "tempo", "meter", "coreMotif", "rationale"].every((key) => nonEmptyString(direction, key))
    || !nonEmptyList(direction, "soundPalette")) {
    findings.push(finding("DIRECTION_INVALID", "plan.direction.json", "direction must define tonal center, tempo, meter, motif, sound palette, and rationale"));
  }
  const arrangementValue = parseJson(files, "plan.arrangement.json", findings);
  const arrangement = isRecord(arrangementValue) ? arrangementValue : {};
  if (arrangement.schema !== ARRANGEMENT_SCHEMA || arrangement.artifactId !== model.artifactId
    || !nonEmptyList(arrangement, "sections") || !nonEmptyList(arrangement, "instrumentRoles")
    || !["dynamicsIntent", "spaceIntent", "mixIntent"].every((key) => nonEmptyString(arrangement, key))) {
    findings.push(finding("ARRANGEMENT_INVALID", "plan.arrangement.json", "arrangement must define sections, instrument roles, dynamics, space, and mix intent"));
  }
  const compositionValue = parseJson(files, "plan.skill-composition.json", findings);
  const composition = isRecord(compositionValue) ? compositionValue : {};
  const workers = Array.isArray(composition.workers) ? composition.workers.filter(isRecord) : [];
  let valid = composition.schema === SKILL_COMPOSITION_SCHEMA && composition.artifactId === model.artifactId && workers.length === EXTERNAL_SKILLS.length;
  for (const expected of EXTERNAL_SKILLS) {
    const worker = workers.find((entry) => entry.name === expected.name);
    if (!worker || worker.revision !== expected.revision || worker.ecosystem !== expected.ecosystem || worker.mode !== expected.mode
      || !["used", "skipped"].includes(String(worker.status)) || typeof worker.reason !== "string" || !worker.reason.trim()) valid = false;
    if (worker?.status === "used") {
      const advicePath = `evidence/skills/${expected.name}.json`;
      if (worker.advicePath !== advicePath) valid = false;
      const adviceValue = files[advicePath];
      try {
        const advice = JSON.parse(adviceValue ?? "null") as Record<string, unknown> | null;
        if (!advice || advice.schema !== SKILL_ADVICE_SCHEMA || advice.skillName !== expected.name || advice.revision !== expected.revision
          || advice.subjectDigest !== computeMusicSubjectDigest(model)) valid = false;
      } catch { valid = false; }
    }
  }
  for (const phase of ["brief", "direction", "composition", "arrangement", "render", "preview", "review"]) {
    const active = workers.filter((worker) => worker.status === "used" && EXTERNAL_SKILLS.find((entry) => entry.name === worker.name)?.phases.includes(phase as never));
    if (active.length > 3) findings.push(finding("SKILL_COMPOSITION_ACTIVE_LIMIT", "plan.skill-composition.json", `at most three advisers may be active in ${phase}`));
  }
  if (!valid) findings.push(finding("SKILL_COMPOSITION_INVALID", "plan.skill-composition.json", "composition must declare the exact pinned bilingual adviser pool and current digest-bound advice for used workers"));
}

function validateProject(model: MusicModel, findings: MusicFinding[]) {
  const project = model?.project;
  if (project?.schema !== PROJECT_SCHEMA) findings.push(finding("PROJECT_SCHEMA_INVALID", "music.project.json", `project schema must be ${PROJECT_SCHEMA}`));
  if (project?.artifactId !== model?.artifactId) findings.push(finding("ARTIFACT_ID_MISMATCH", "music.project.json", "artifactId must match the directory id"));
  if (project?.sampleRate !== 48000 || project?.channels !== 2) findings.push(finding("AUDIO_FORMAT_INVALID", "music.project.json", "v1 requires 48000 Hz stereo output"));
  const tailSeconds = project?.tailSeconds;
  if (!Number.isFinite(tailSeconds) || (tailSeconds as number) < 0 || (tailSeconds as number) > 30) findings.push(finding("AUDIO_TAIL_INVALID", "music.project.json", "tailSeconds must be between 0 and 30"));
  const tracks = Array.isArray(project?.tracks) ? project.tracks : [];
  if (tracks.length === 0 || tracks.length > 8) findings.push(finding("TRACK_COUNT_INVALID", "music.project.json", "v1 requires between one and eight tracks"));
  tracks.forEach((track, offset) => {
    if (track?.index !== offset + 1) findings.push(finding("TRACK_SEQUENCE_INVALID", "music.project.json", "track indexes must be contiguous"));
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(track?.id ?? "") || !ROLE.test(track?.role ?? "")) findings.push(finding("TRACK_IDENTITY_INVALID", "music.project.json", "track id and role must use the v1 vocabulary"));
    if (typeof track?.instrument !== "string" || !/^src\/instruments\/[a-z0-9]+(?:-[a-z0-9]+)*\.mjs$/u.test(track.instrument)) {
      findings.push(finding("INSTRUMENT_PATH_INVALID", "music.project.json", "instrument must be a local src/instruments module"));
    } else if (!(track.instrument in (model.files ?? {}))) {
      findings.push(finding("INSTRUMENT_MISSING", track.instrument, "registered instrument module is missing"));
    } else if (INSTRUMENT_OWNER_VIOLATION.test(model.files?.[track.instrument] ?? "")) {
      findings.push(finding("INSTRUMENT_OWNER_VIOLATION", track.instrument, "instrument modules may not own transport, destination, render, network, wall-clock, or randomness"));
    }
  });
}

function validateSourceArtifacts(model: MusicModel, findings: MusicFinding[]) {
  const paths = musicSourcePaths(model);
  const outputs = [paths.score, paths.metrics, paths.mix, ...paths.proofs];
  const files = model.files ?? {};
  for (const filePath of [...outputs, paths.renderReceipt]) {
    if (!(filePath in files)) findings.push(finding("SOURCE_ARTIFACT_MISSING", filePath, `${filePath} must match the current source digest`));
  }
  const score = parseJson(model.files, paths.score, findings);
  const metrics = parseJson(model.files, paths.metrics, findings);
  const renderReceipt = parseJson(model.files, paths.renderReceipt, findings);
  const scoreRecord = isRecord(score) ? score : null;
  const metricsRecord = isRecord(metrics) ? metrics : null;
  const receiptRecord = isRecord(renderReceipt) ? renderReceipt : null;
  if (score && scoreRecord?.schema !== "tonejs-symbolic-score/v1") findings.push(finding("SCORE_SCHEMA_INVALID", paths.score, "score schema must be tonejs-symbolic-score/v1"));
  if (score && scoreRecord?.sourceDigest !== paths.subjectDigest) findings.push(finding("SCORE_DIGEST_INVALID", paths.score, "score must bind the current source digest"));
  if (metrics && metricsRecord?.schema !== "tonejs-music-metrics/v1") findings.push(finding("METRICS_SCHEMA_INVALID", paths.metrics, "metrics schema must be tonejs-music-metrics/v1"));
  if (metrics && metricsRecord?.sourceDigest !== paths.subjectDigest) findings.push(finding("METRICS_DIGEST_INVALID", paths.metrics, "metrics must bind the current source digest"));
  for (const filePath of [paths.mix, ...paths.proofs]) {
    const value = files[filePath];
    if (typeof value === "string" && !(value.startsWith("RIFF") && value.slice(8, 12) === "WAVE")) findings.push(finding("WAV_HEADER_INVALID", filePath, "rendered audio must have a RIFF/WAVE header"));
  }
  const expectedOutputs = Object.fromEntries(outputs.map((filePath) => [filePath, digestFor(model, filePath)]));
  if (renderReceipt && (receiptRecord?.schema !== "tonejs-render-receipt/v1"
    || receiptRecord?.sourceDigest !== paths.subjectDigest
    || JSON.stringify(receiptRecord?.outputs) !== JSON.stringify(expectedOutputs))) {
    findings.push(finding("RENDER_RECEIPT_INVALID", paths.renderReceipt, "renderer receipt must bind current score, metrics, mix, and proofs"));
  }
  const preview = parseJson(model.files, paths.preview, findings);
  const previewRecord = isRecord(preview) ? preview : null;
  if (preview && (previewRecord?.schema !== PREVIEW_SCHEMA || previewRecord?.subjectDigest !== paths.subjectDigest
    || previewRecord?.mixSha256 !== digestFor(model, paths.mix)
    || JSON.stringify(previewRecord?.stems) !== JSON.stringify(Object.fromEntries(paths.proofs.map((filePath) => [filePath, digestFor(model, filePath)]))))) {
    findings.push(finding("PREVIEW_INVALID", paths.preview, "preview evidence must bind the current mix and every stem without re-rendering"));
  }
}

export function musicReviewArtifactPaths(model: MusicModel) {
  const paths = musicSourcePaths(model);
  return [paths.score, paths.metrics, paths.renderReceipt, paths.mix, ...paths.proofs, paths.preview];
}

export function validateMusicReview(model: MusicModel, { requireApproved = false }: { requireApproved?: boolean } = {}) {
  const findings: MusicFinding[] = [];
  const reviewValue = parseJson(model.files, "review.music.json", findings);
  const review = isRecord(reviewValue) ? reviewValue : {};
  const expectedPaths = musicReviewArtifactPaths(model);
  const coverage = Array.isArray(review.coverage) ? review.coverage.filter(isRecord) : [];
  const reviewer = isRecord(review.reviewer) ? review.reviewer : {};
  const renderValue = parseJson(model.files, musicSourcePaths(model).renderReceipt, findings);
  const render = isRecord(renderValue) ? renderValue : {};
  if (review.schema !== REVIEW_SCHEMA || review.artifactId !== model.artifactId || review.subjectDigest !== computeMusicSubjectDigest(model)
    || !["approved", "changes_requested"].includes(String(review.decision)) || !["human", "independent-agent"].includes(String(reviewer.kind))
    || typeof reviewer.sessionId !== "string" || !reviewer.sessionId) findings.push(finding("REVIEW_INVALID", "review.music.json", "review must bind the project, current subject, independent reviewer, and a supported decision"));
  if (reviewer.sessionId && reviewer.sessionId === render.sessionId) findings.push(finding("REVIEW_SELF", "review.music.json", "reviewer session must differ from the session that produced the current render"));
  if (requireApproved && review.decision !== "approved") findings.push(finding("REVIEW_NOT_APPROVED", "review.music.json", "release requires an approved current review"));
  if (coverage.length !== expectedPaths.length || coverage.some((entry, index) => entry.path !== expectedPaths[index] || entry.sha256 !== digestFor(model, expectedPaths[index] ?? ""))) {
    findings.push(finding("REVIEW_COVERAGE_INVALID", "review.music.json", "review must cover the exact current score, render, preview, mix, and every stem"));
  }
  const checks = Array.isArray(review.checks) ? review.checks.filter(isRecord) : [];
  const requiredChecks = ["brief-alignment", "melody-harmony", "rhythm-groove", "form-arrangement", "timbre-orchestration", "balance-space-dynamics", "technical-integrity"];
  if (!requiredChecks.every((id) => checks.some((entry) => entry.id === id && ["pass", "fail"].includes(String(entry.status)) && typeof entry.note === "string" && entry.note.trim().length >= 8))) {
    findings.push(finding("REVIEW_CHECKS_INCOMPLETE", "review.music.json", "all musical and technical checks require a pass/fail result and substantive note"));
  }
  const reviewFindings = Array.isArray(review.findings) ? review.findings.filter(isRecord) : [];
  const invalidFinding = reviewFindings.some((entry) => !["blocker", "major", "minor", "info"].includes(String(entry.severity))
    || typeof entry.findingId !== "string" || !entry.findingId.trim() || typeof entry.evidenceAnchor !== "string" || !expectedPaths.includes(String(entry.evidenceAnchor))
    || entry.artifactDigest !== digestFor(model, String(entry.evidenceAnchor)) || typeof entry.fix !== "string" || !entry.fix.trim()
    || !["open", "verified"].includes(String(entry.status)) || (review.decision === "approved" && ["blocker", "major"].includes(String(entry.severity)) && (entry.status !== "verified" || typeof entry.recheckEvidence !== "string" || !entry.recheckEvidence.trim())));
  if (invalidFinding || (review.decision === "approved" && checks.some((entry) => entry.status !== "pass"))) findings.push(finding("REVIEW_FINDINGS_INVALID", "review.music.json", "approved review requires passing checks and verified blocker or major findings"));
  return findings;
}

export function validateMusicModel(model: MusicModel, { stage = "source" }: { stage?: string } = {}): MusicFinding[] {
  const findings: MusicFinding[] = [];
  const files = model.files ?? {};
  if (".music-delivery-journal.json" in files) findings.push(finding("MUTATION_JOURNAL_OPEN", ".music-delivery-journal.json", "an interrupted writer must be resumed or rolled back"));
  validateRequired(files, findings);
  validateGitignore(files, findings);
  validatePlan(model, findings);
  validatePlanning(model, findings);
  validateProject(model, findings);
  if (COMPOSITION_OWNER_VIOLATION.test(files["src/composition.mjs"] ?? "")) findings.push(finding("COMPOSITION_OWNER_VIOLATION", "src/composition.mjs", "composition config may not render, access network, wall-clock, or unseeded randomness"));
  if (stage !== "design") validateSourceArtifacts(model, findings);
  if (stage === "release") {
    for (const filePath of [...releaseOutputPaths(model), "receipt.release.json"]) {
      if (!(filePath in files)) findings.push(finding("RELEASE_PATH_MISSING", filePath, `${filePath} is required for release`));
    }
    if ("receipt.release.json" in files && !validateMusicReceipt(model)) findings.push(finding("RECEIPT_INVALID", "receipt.release.json", "release receipt must bind current sources and outputs"));
    findings.push(...validateMusicReview(model, { requireApproved: true }));
  }
  return findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));
}

export function evaluateMusicWrite({ relativePath = "", toolName = "", writer = "", cwd = "" }: {
  relativePath?: string;
  toolName?: string;
  writer?: string;
  cwd?: string;
} = {}): MusicWriteDecision {
  const inside = projectInside(relativePath, cwd, "music");
  if (!inside) return { decision: "allow" };
  if (GENERATED_PATH.test(inside) && !writer.startsWith("music-project-")) {
    return {
      decision: "deny",
      code: "PROTECTED_WRITER_REQUIRED",
      message: `${inside} must be written by a registered music tool, not ${toolName || "an unregistered tool"}`,
    };
  }
  return { decision: "allow" };
}
