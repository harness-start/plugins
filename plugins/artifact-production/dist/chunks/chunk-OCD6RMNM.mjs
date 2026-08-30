// harness-source-hash: sha256:094ae85928967976215355a7d8cc86aa39fa623154b1006d53784ddde5b76db8
import {
  projectInside
} from "./chunk-FLUQYJTI.mjs";

// plugins/artifact-production/src/domains/music/lib/contract.ts
import { createHash } from "node:crypto";
var GENERATED_PATH = /^(?:plan\.contract\.json$|build\/|proofs\/|dist\/|evidence(?:\.|\/)|review\.music\.json$|release\.manifest\.json$|receipt\.release\.json$|\.music-delivery-journal\.json$)/u;
var SUBJECT_EXCLUDED_PATH = /^(?:plan\.contract\.json$|build\/|proofs\/|dist\/|evidence(?:\.|\/)|review\.music\.json$|release\.manifest\.json$|receipt\.release\.json$|review\/|\.music-delivery-journal\.json$)/u;
var COMPOSITION_OWNER_VIOLATION = /(?:\b(?:fetch|XMLHttpRequest|WebSocket|Date\.now|Math\.random)\b|https?:\/\/|Tone\.(?:Offline|Recorder|start)\b|getTransport\(\)\.(?:start|stop)\s*\()/u;
var INSTRUMENT_OWNER_VIOLATION = /(?:\b(?:fetch|XMLHttpRequest|WebSocket|Date\.now|Math\.random)\b|https?:\/\/|\.toDestination\s*\(|Tone\.(?:Offline|Recorder|start)\b|getTransport\(\)\.(?:start|stop)\s*\()/u;
var ROLE = /^(?:bass|drums|fx|harmony|melody|texture)$/u;
var MUSIC_ENGINE = "music-production@0.4.0";
var PLAN_SCHEMA = "music-production/plan/v1";
var LEGACY_BRIEF_SCHEMA = "music-production/brief/v1";
var BRIEF_SCHEMA = "music-production/brief/v2";
var DIRECTION_SCHEMA = "music-production/direction/v1";
var ARRANGEMENT_SCHEMA = "music-production/arrangement/v1";
var LEGACY_SKILL_COMPOSITION_SCHEMA = "music-production/skill-composition/v1";
var SKILL_COMPOSITION_SCHEMA = "music-production/skill-composition/v2";
var SKILL_ADVICE_INPUT_SCHEMA = "music-production/advice-input/v1";
var SKILL_ADVICE_SCHEMA = "music-production/advice/v1";
var REFERENCE_SOURCES_INPUT_SCHEMA = "music-production/reference-sources-input/v1";
var REFERENCE_PROFILE_INPUT_SCHEMA = "music-production/reference-profile-input/v1";
var REFERENCE_PROFILE_SCHEMA = "music-production/reference-profile/v1";
var PREVIEW_SCHEMA = "music-production/preview/v1";
var LEGACY_REVIEW_INPUT_SCHEMA = "music-production/review-input/v1";
var REVIEW_INPUT_SCHEMA = "music-production/review-input/v2";
var LEGACY_REVIEW_SCHEMA = "music-production/review/v1";
var REVIEW_SCHEMA = "music-production/review/v2";
var PROJECT_SCHEMA = "music-production/project/v1";
var LEGACY_EXTERNAL_SKILLS = [
  { name: "music-composition-method", ecosystem: "en", mode: "adviser", artifactKind: "advice", phases: ["brief", "direction", "composition", "arrangement"] },
  { name: "music-genre-reference", ecosystem: "zh", mode: "reference-only", artifactKind: "advice", phases: ["brief", "direction", "arrangement"] },
  { name: "music-mix-qc", ecosystem: "en", mode: "reference-only", artifactKind: "advice", phases: ["arrangement", "render", "preview", "review"] }
];
var EXTERNAL_SKILLS = [
  LEGACY_EXTERNAL_SKILLS[0],
  LEGACY_EXTERNAL_SKILLS[1],
  { name: "music-reference-profile", ecosystem: "en", mode: "reference-only", artifactKind: "reference-profile", phases: ["brief", "reference-analysis", "direction", "arrangement"] },
  LEGACY_EXTERNAL_SKILLS[2]
];
var sha256 = (value) => createHash("sha256").update(value).digest("hex");
var finding = (code, path, message) => ({ code, path, message });
var digestFor = (model, filePath) => model.digests?.[filePath] ?? sha256(model.files?.[filePath] ?? "");
function computeMusicSubjectDigest(model) {
  const records = Object.entries(model?.files ?? {}).filter(([filePath, value]) => typeof value === "string" && !SUBJECT_EXCLUDED_PATH.test(filePath)).sort(([left], [right]) => left.localeCompare(right)).map(([filePath]) => `${filePath}\0${digestFor(model, filePath)}
`).join("");
  return sha256(`${MUSIC_ENGINE}
${records}`);
}
function musicBriefSha256(model) {
  return sha256(model.files?.["plan.brief.json"] ?? "");
}
function musicReferenceProfilePath(model) {
  return `evidence/reference-profile.${musicBriefSha256(model)}.json`;
}
function musicReferenceAnalysisRequired(model) {
  try {
    const brief = JSON.parse(model.files?.["plan.brief.json"] ?? "null");
    return isRecord(brief) && brief.schema === BRIEF_SCHEMA && isRecord(brief.reference) && brief.reference.mode === "source-analysis";
  } catch {
    return false;
  }
}
var REFERENCE_DIMENSIONS = ["rhythmicFoundation", "harmonicArchitecture", "instrumentalTechniques", "productionAesthetics", "genreFusion", "energyArchitecture"];
var TONEJS_MAPPINGS = ["rhythmAndTempo", "harmonyAndVoicing", "timbreAndEffects", "spaceAndDynamics", "formAndEnergy"];
function validateMusicReferenceProfile(model) {
  const findings = [];
  if (!musicReferenceAnalysisRequired(model)) return findings;
  const path = musicReferenceProfilePath(model);
  const value = parseJson(model.files, path, findings);
  const profile = isRecord(value) ? value : {};
  const brief = (() => {
    try {
      return JSON.parse(model.files?.["plan.brief.json"] ?? "null");
    } catch {
      return null;
    }
  })();
  const reference = isRecord(brief) && isRecord(brief.reference) ? brief.reference : {};
  const dimensions = isRecord(profile.dimensions) ? profile.dimensions : {};
  const mapping = isRecord(profile.toneJsMapping) ? profile.toneJsMapping : {};
  const antiImitation = isRecord(profile.antiImitation) ? profile.antiImitation : {};
  const traitsValid = REFERENCE_DIMENSIONS.every((key) => Array.isArray(dimensions[key]) && dimensions[key].length > 0 && dimensions[key].every((item) => isRecord(item) && nonEmptyString(item, "trait") && ["observed", "inferred", "user-described"].includes(String(item.basis)) && nonEmptyList(item, "referenceIds")));
  const mappingsValid = TONEJS_MAPPINGS.every((key) => Array.isArray(mapping[key]) && mapping[key].length > 0 && mapping[key].every((item) => typeof item === "string" && item.trim().length > 0));
  const descriptors = Array.isArray(profile.descriptors) ? profile.descriptors : [];
  const unsupportedTraits = Array.isArray(profile.unsupportedTraits) ? profile.unsupportedTraits : [];
  if (profile.schema !== REFERENCE_PROFILE_SCHEMA || profile.plugin !== "music-production" || profile.artifactId !== model.artifactId || profile.briefSha256 !== musicBriefSha256(model) || profile.sourceSetSha256 !== reference.sourceSetSha256 || profile.skillName !== "music-reference-profile" || Object.hasOwn(profile, "revision") || profile.ecosystem !== "en" || profile.mode !== "reference-only" || profile.phase !== "reference-analysis" || !Number.isInteger(profile.referenceCount) || Number(profile.referenceCount) < 3 || Number(profile.referenceCount) > 5 || !traitsValid || !mappingsValid || descriptors.length < 5 || descriptors.length > 10 || descriptors.some((item) => typeof item !== "string" || !item.trim()) || unsupportedTraits.some((item) => !isRecord(item) || !nonEmptyString(item, "trait") || !nonEmptyString(item, "reason")) || antiImitation.artistNamesRemoved !== true || antiImitation.signatureMaterialExcluded !== true || antiImitation.imitationPromptExcluded !== true) {
    findings.push(finding("REFERENCE_PROFILE_INVALID", path, "reference profile must bind the current brief and source manifest, cover all six dimensions, map implementable Tone.js traits, and exclude imitation"));
  }
  return findings;
}
function musicSourcePaths(model) {
  const subjectDigest = computeMusicSubjectDigest(model);
  const tracks = Array.isArray(model?.project?.tracks) ? model.project.tracks : [];
  return {
    subjectDigest,
    score: `build/score.${subjectDigest}.json`,
    metrics: `build/metrics.${subjectDigest}.json`,
    renderReceipt: `build/render.${subjectDigest}.json`,
    mix: `build/mix.${subjectDigest}.wav`,
    proofs: tracks.map((track) => `proofs/t${String(track.index).padStart(3, "0")}-${track.role}-${track.id}.${subjectDigest}.wav`),
    preview: `evidence/preview.${subjectDigest}.json`
  };
}
function releaseOutputPaths(model) {
  return [
    `dist/${model.artifactId}.wav`,
    "evidence.audio.json",
    "review.music.json",
    "release.manifest.json"
  ];
}
function createMusicReceipt(model) {
  const { subjectDigest } = musicSourcePaths(model);
  return {
    schemaVersion: 2,
    plugin: "music-production",
    engine: MUSIC_ENGINE,
    artifactId: model?.artifactId,
    stage: "release",
    subjectDigest,
    outputs: Object.fromEntries(releaseOutputPaths(model).map((filePath) => [filePath, digestFor(model, filePath)]))
  };
}
function validateMusicReceipt(model) {
  try {
    const actual = JSON.parse(model.files?.["receipt.release.json"] ?? "");
    const expected = createMusicReceipt(model);
    if (typeof actual !== "object" || actual === null) return false;
    const record = actual;
    return record.schemaVersion === expected.schemaVersion && record.plugin === expected.plugin && record.engine === expected.engine && record.artifactId === expected.artifactId && record.stage === expected.stage && record.subjectDigest === expected.subjectDigest && JSON.stringify(record.outputs) === JSON.stringify(expected.outputs);
  } catch {
    return false;
  }
}
function parseJson(files, filePath, findings) {
  const text = files?.[filePath];
  if (typeof text !== "string") {
    findings.push(finding("REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    findings.push(finding("JSON_INVALID", filePath, `${filePath} must contain valid JSON`));
    return null;
  }
}
function validateRequired(files, findings) {
  for (const filePath of [
    ".gitignore",
    "package.json",
    "package-lock.json",
    "plan.contract.json",
    "music.project.json",
    "src/composition.mjs"
  ]) {
    if (!(filePath in files)) findings.push(finding("REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
  }
}
function validateGitignore(files, findings) {
  const text = files[".gitignore"];
  if (typeof text !== "string") return;
  text.split(/\r?\n/u).forEach((raw, offset) => {
    const line = raw.trim().replace(/^\//u, "");
    if (line && !line.startsWith("#") && !line.startsWith("!") && /^(?:build|proofs|dist|review|evidence|release|receipt)(?:\/|\.|$)/u.test(line)) {
      findings.push(finding("DELIVERY_PATH_IGNORED", `.gitignore:${offset + 1}`, `artifact delivery path must not be ignored: ${raw.trim()}`));
    }
  });
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validatePlan(model, findings) {
  const files = model.files ?? {};
  const plan = parseJson(files, "plan.contract.json", findings);
  if (!plan) return;
  const record = isRecord(plan) ? plan : {};
  if (record.schema !== PLAN_SCHEMA) findings.push(finding("PLAN_SCHEMA_INVALID", "plan.contract.json", `plan schema must be ${PLAN_SCHEMA}`));
  if (record.artifactId !== model.artifactId) findings.push(finding("PLAN_ARTIFACT_MISMATCH", "plan.contract.json", "plan artifactId must match the music project directory"));
  if (record.targetStage !== "source" && record.targetStage !== "release") findings.push(finding("PLAN_STAGE_INVALID", "plan.contract.json", "targetStage must be source or release"));
}
function nonEmptyString(record, key) {
  return typeof record[key] === "string" && String(record[key]).trim().length > 0;
}
function nonEmptyList(record, key) {
  return Array.isArray(record[key]) && record[key].length > 0;
}
function validatePlanning(model, findings) {
  const files = model.files ?? {};
  const briefValue = parseJson(files, "plan.brief.json", findings);
  const brief = isRecord(briefValue) ? briefValue : {};
  const reference = isRecord(brief.reference) ? brief.reference : {};
  const referenceMode = String(reference.mode ?? "");
  const legacyBrief = brief.schema === LEGACY_BRIEF_SCHEMA;
  const currentBrief = brief.schema === BRIEF_SCHEMA;
  const referenceValid = legacyBrief ? nonEmptyList(brief, "referenceTraits") : currentBrief && ["none", "traits", "source-analysis"].includes(referenceMode) && (referenceMode !== "source-analysis" || typeof reference.sourceSetSha256 === "string" && /^[a-f0-9]{64}$/u.test(reference.sourceSetSha256)) && (referenceMode !== "traits" || nonEmptyList(brief, "referenceTraits"));
  if (!legacyBrief && !currentBrief || brief.artifactId !== model.artifactId || !["language", "audience", "useCase", "mood", "genre"].every((key) => nonEmptyString(brief, key)) || !Number.isFinite(brief.durationSeconds) || Number(brief.durationSeconds) <= 0 || !referenceValid || !["structure", "instrumentation", "constraints", "prohibitedDirections", "successCriteria"].every((key) => nonEmptyList(brief, key))) {
    findings.push(finding("BRIEF_INVALID", "plan.brief.json", "brief must bind the project and define audience, use, duration, musical intent, constraints, prohibited directions, and success criteria"));
  }
  const directionValue = parseJson(files, "plan.direction.json", findings);
  const direction = isRecord(directionValue) ? directionValue : {};
  if (direction.schema !== DIRECTION_SCHEMA || direction.artifactId !== model.artifactId || !["tonalCenter", "tempo", "meter", "coreMotif", "rationale"].every((key) => nonEmptyString(direction, key)) || !nonEmptyList(direction, "soundPalette")) {
    findings.push(finding("DIRECTION_INVALID", "plan.direction.json", "direction must define tonal center, tempo, meter, motif, sound palette, and rationale"));
  }
  const arrangementValue = parseJson(files, "plan.arrangement.json", findings);
  const arrangement = isRecord(arrangementValue) ? arrangementValue : {};
  if (arrangement.schema !== ARRANGEMENT_SCHEMA || arrangement.artifactId !== model.artifactId || !nonEmptyList(arrangement, "sections") || !nonEmptyList(arrangement, "instrumentRoles") || !["dynamicsIntent", "spaceIntent", "mixIntent"].every((key) => nonEmptyString(arrangement, key))) {
    findings.push(finding("ARRANGEMENT_INVALID", "plan.arrangement.json", "arrangement must define sections, instrument roles, dynamics, space, and mix intent"));
  }
  const compositionValue = parseJson(files, "plan.skill-composition.json", findings);
  const composition = isRecord(compositionValue) ? compositionValue : {};
  const workers = Array.isArray(composition.workers) ? composition.workers.filter(isRecord) : [];
  const pool = composition.schema === LEGACY_SKILL_COMPOSITION_SCHEMA ? LEGACY_EXTERNAL_SKILLS : composition.schema === SKILL_COMPOSITION_SCHEMA ? EXTERNAL_SKILLS : [];
  let valid = pool.length > 0 && composition.artifactId === model.artifactId && workers.length === pool.length;
  if (currentBrief && composition.schema !== SKILL_COMPOSITION_SCHEMA) valid = false;
  const referenceFindings = validateMusicReferenceProfile(model);
  for (const expected of pool) {
    const worker = workers.find((entry) => entry.name === expected.name);
    if (!worker || Object.hasOwn(worker, "revision") || worker.ecosystem !== expected.ecosystem || worker.mode !== expected.mode || !["used", "skipped"].includes(String(worker.status)) || typeof worker.reason !== "string" || !worker.reason.trim()) valid = false;
    if (composition.schema === SKILL_COMPOSITION_SCHEMA && worker?.artifactKind !== expected.artifactKind) valid = false;
    if (worker?.status === "used") {
      if (expected.artifactKind === "reference-profile") {
        const profilePath = musicReferenceProfilePath(model);
        if (worker.evidencePath !== profilePath || referenceFindings.length > 0) valid = false;
      } else {
        const advicePath = `evidence/skills/${expected.name}.json`;
        const declaredPath = composition.schema === LEGACY_SKILL_COMPOSITION_SCHEMA ? worker.advicePath : worker.evidencePath;
        if (declaredPath !== advicePath) valid = false;
        const adviceValue = files[advicePath];
        try {
          const advice = JSON.parse(adviceValue ?? "null");
          if (!advice || Object.hasOwn(advice, "revision") || advice.schema !== SKILL_ADVICE_SCHEMA || advice.skillName !== expected.name || advice.subjectDigest !== computeMusicSubjectDigest(model)) valid = false;
        } catch {
          valid = false;
        }
      }
    }
  }
  if (composition.schema === SKILL_COMPOSITION_SCHEMA) {
    const musicalDna = workers.find((entry) => entry.name === "music-reference-profile");
    if (referenceMode === "source-analysis" ? musicalDna?.status !== "used" : musicalDna?.status !== "skipped") valid = false;
  }
  for (const phase of ["brief", "reference-analysis", "direction", "composition", "arrangement", "render", "preview", "review"]) {
    const active = workers.filter((worker) => worker.status === "used" && pool.find((entry) => entry.name === worker.name)?.phases.includes(phase));
    if (active.length > 3) findings.push(finding("SKILL_COMPOSITION_ACTIVE_LIMIT", "plan.skill-composition.json", `at most three advisers may be active in ${phase}`));
  }
  if (!valid) findings.push(finding("SKILL_COMPOSITION_INVALID", "plan.skill-composition.json", "composition must declare the current-source adviser pool and current evidence for every used worker"));
  findings.push(...referenceFindings);
}
function validateProject(model, findings) {
  const project = model?.project;
  if (project?.schema !== PROJECT_SCHEMA) findings.push(finding("PROJECT_SCHEMA_INVALID", "music.project.json", `project schema must be ${PROJECT_SCHEMA}`));
  if (project?.artifactId !== model?.artifactId) findings.push(finding("ARTIFACT_ID_MISMATCH", "music.project.json", "artifactId must match the directory id"));
  if (project?.sampleRate !== 48e3 || project?.channels !== 2) findings.push(finding("AUDIO_FORMAT_INVALID", "music.project.json", "v1 requires 48000 Hz stereo output"));
  const tailSeconds = project?.tailSeconds;
  if (!Number.isFinite(tailSeconds) || tailSeconds < 0 || tailSeconds > 30) findings.push(finding("AUDIO_TAIL_INVALID", "music.project.json", "tailSeconds must be between 0 and 30"));
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
function validateSourceArtifacts(model, findings) {
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
  if (renderReceipt && (receiptRecord?.schema !== "tonejs-render-receipt/v1" || receiptRecord?.sourceDigest !== paths.subjectDigest || JSON.stringify(receiptRecord?.outputs) !== JSON.stringify(expectedOutputs))) {
    findings.push(finding("RENDER_RECEIPT_INVALID", paths.renderReceipt, "renderer receipt must bind current score, metrics, mix, and proofs"));
  }
  const preview = parseJson(model.files, paths.preview, findings);
  const previewRecord = isRecord(preview) ? preview : null;
  if (preview && (previewRecord?.schema !== PREVIEW_SCHEMA || previewRecord?.subjectDigest !== paths.subjectDigest || previewRecord?.mixSha256 !== digestFor(model, paths.mix) || JSON.stringify(previewRecord?.stems) !== JSON.stringify(Object.fromEntries(paths.proofs.map((filePath) => [filePath, digestFor(model, filePath)]))))) {
    findings.push(finding("PREVIEW_INVALID", paths.preview, "preview evidence must bind the current mix and every stem without re-rendering"));
  }
}
function musicReviewArtifactPaths(model) {
  const paths = musicSourcePaths(model);
  return [
    paths.score,
    paths.metrics,
    paths.renderReceipt,
    paths.mix,
    ...paths.proofs,
    paths.preview,
    ...musicReferenceAnalysisRequired(model) ? [musicReferenceProfilePath(model)] : []
  ];
}
function validateMusicReview(model, { requireApproved = false } = {}) {
  const findings = [];
  const reviewValue = parseJson(model.files, "review.music.json", findings);
  const review = isRecord(reviewValue) ? reviewValue : {};
  const expectedPaths = musicReviewArtifactPaths(model);
  const coverage = Array.isArray(review.coverage) ? review.coverage.filter(isRecord) : [];
  const reviewer = isRecord(review.reviewer) ? review.reviewer : {};
  const renderValue = parseJson(model.files, musicSourcePaths(model).renderReceipt, findings);
  const render = isRecord(renderValue) ? renderValue : {};
  const expectedReviewSchema = (() => {
    try {
      const brief = JSON.parse(model.files?.["plan.brief.json"] ?? "null");
      return isRecord(brief) && brief.schema === BRIEF_SCHEMA ? REVIEW_SCHEMA : LEGACY_REVIEW_SCHEMA;
    } catch {
      return LEGACY_REVIEW_SCHEMA;
    }
  })();
  if (review.schema !== expectedReviewSchema || review.artifactId !== model.artifactId || review.subjectDigest !== computeMusicSubjectDigest(model) || !["approved", "changes_requested"].includes(String(review.decision)) || !["human", "independent-agent"].includes(String(reviewer.kind)) || typeof reviewer.sessionId !== "string" || !reviewer.sessionId) findings.push(finding("REVIEW_INVALID", "review.music.json", "review must bind the project, current subject, independent reviewer, and a supported decision"));
  if (reviewer.sessionId && reviewer.sessionId === render.sessionId) findings.push(finding("REVIEW_SELF", "review.music.json", "reviewer session must differ from the session that produced the current render"));
  if (requireApproved && review.decision !== "approved") findings.push(finding("REVIEW_NOT_APPROVED", "review.music.json", "release requires an approved current review"));
  if (coverage.length !== expectedPaths.length || coverage.some((entry, index) => entry.path !== expectedPaths[index] || entry.sha256 !== digestFor(model, expectedPaths[index] ?? ""))) {
    findings.push(finding("REVIEW_COVERAGE_INVALID", "review.music.json", "review must cover the exact current score, render, preview, mix, and every stem"));
  }
  const checks = Array.isArray(review.checks) ? review.checks.filter(isRecord) : [];
  const requiredChecks = [
    "brief-alignment",
    "melody-harmony",
    "rhythm-groove",
    "form-arrangement",
    "timbre-orchestration",
    "balance-space-dynamics",
    "technical-integrity",
    ...musicReferenceAnalysisRequired(model) ? ["reference-profile-alignment"] : []
  ];
  if (!requiredChecks.every((id) => checks.some((entry) => entry.id === id && ["pass", "fail"].includes(String(entry.status)) && typeof entry.note === "string" && entry.note.trim().length >= 8))) {
    findings.push(finding("REVIEW_CHECKS_INCOMPLETE", "review.music.json", "all musical and technical checks require a pass/fail result and substantive note"));
  }
  const reviewFindings = Array.isArray(review.findings) ? review.findings.filter(isRecord) : [];
  const invalidFinding = reviewFindings.some((entry) => !["blocker", "major", "minor", "info"].includes(String(entry.severity)) || typeof entry.findingId !== "string" || !entry.findingId.trim() || typeof entry.evidenceAnchor !== "string" || !expectedPaths.includes(String(entry.evidenceAnchor)) || entry.artifactDigest !== digestFor(model, String(entry.evidenceAnchor)) || typeof entry.fix !== "string" || !entry.fix.trim() || !["open", "verified"].includes(String(entry.status)) || review.decision === "approved" && ["blocker", "major"].includes(String(entry.severity)) && (entry.status !== "verified" || typeof entry.recheckEvidence !== "string" || !entry.recheckEvidence.trim()));
  if (invalidFinding || review.decision === "approved" && checks.some((entry) => entry.status !== "pass")) findings.push(finding("REVIEW_FINDINGS_INVALID", "review.music.json", "approved review requires passing checks and verified blocker or major findings"));
  return findings;
}
function validateMusicModel(model, { stage = "source" } = {}) {
  const findings = [];
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
function evaluateMusicWrite({ relativePath = "", toolName = "", writer = "", cwd = "" } = {}) {
  const inside = projectInside(relativePath, cwd, "music");
  if (!inside) return { decision: "allow" };
  if (GENERATED_PATH.test(inside) && !writer.startsWith("music-project-")) {
    return {
      decision: "deny",
      code: "PROTECTED_WRITER_REQUIRED",
      message: `${inside} must be written by a registered music tool, not ${toolName || "an unregistered tool"}`
    };
  }
  return { decision: "allow" };
}

export {
  MUSIC_ENGINE,
  PLAN_SCHEMA,
  BRIEF_SCHEMA,
  LEGACY_SKILL_COMPOSITION_SCHEMA,
  SKILL_COMPOSITION_SCHEMA,
  SKILL_ADVICE_INPUT_SCHEMA,
  SKILL_ADVICE_SCHEMA,
  REFERENCE_SOURCES_INPUT_SCHEMA,
  REFERENCE_PROFILE_INPUT_SCHEMA,
  REFERENCE_PROFILE_SCHEMA,
  PREVIEW_SCHEMA,
  LEGACY_REVIEW_INPUT_SCHEMA,
  REVIEW_INPUT_SCHEMA,
  LEGACY_REVIEW_SCHEMA,
  REVIEW_SCHEMA,
  EXTERNAL_SKILLS,
  computeMusicSubjectDigest,
  musicBriefSha256,
  musicReferenceProfilePath,
  validateMusicReferenceProfile,
  musicSourcePaths,
  createMusicReceipt,
  musicReviewArtifactPaths,
  validateMusicReview,
  validateMusicModel,
  evaluateMusicWrite
};
