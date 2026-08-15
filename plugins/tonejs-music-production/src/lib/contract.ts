import { createHash } from "node:crypto";
import { projectInside } from "@harness/core/artifact-paths";

const GENERATED_PATH = /^(?:build\/|proofs\/|dist\/|evidence\.audio\.json$|release\.manifest\.json$|receipt\.release\.json$)/u;
const SUBJECT_EXCLUDED_PATH = /^(?:plan\.contract\.json$|build\/|proofs\/|dist\/|evidence\.audio\.json$|release\.manifest\.json$|receipt\.release\.json$|review\/|\.music-delivery-journal\.json$)/u;
const COMPOSITION_OWNER_VIOLATION = /(?:\b(?:fetch|XMLHttpRequest|WebSocket|Date\.now|Math\.random)\b|https?:\/\/|Tone\.(?:Offline|Recorder|start)\b|getTransport\(\)\.(?:start|stop)\s*\()/u;
const INSTRUMENT_OWNER_VIOLATION = /(?:\b(?:fetch|XMLHttpRequest|WebSocket|Date\.now|Math\.random)\b|https?:\/\/|\.toDestination\s*\(|Tone\.(?:Offline|Recorder|start)\b|getTransport\(\)\.(?:start|stop)\s*\()/u;
const ROLE = /^(?:bass|drums|fx|harmony|melody|texture)$/u;
export const MUSIC_ENGINE = "tonejs-music-production@0.2.0";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const finding = (code, path, message) => ({ code, path, message });
const digestFor = (model, filePath) => model?.digests?.[filePath] ?? sha256(model?.files?.[filePath] ?? "");

export function computeMusicSubjectDigest(model) {
  const records = Object.entries(model?.files ?? {})
    .filter(([filePath, value]) => typeof value === "string" && !SUBJECT_EXCLUDED_PATH.test(filePath))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath]) => `${filePath}\0${digestFor(model, filePath)}\n`)
    .join("");
  return sha256(`${MUSIC_ENGINE}\n${records}`);
}

function sourcePaths(model) {
  const subjectDigest = computeMusicSubjectDigest(model);
  const tracks = Array.isArray(model?.project?.tracks) ? model.project.tracks : [];
  return {
    subjectDigest,
    score: `build/score.${subjectDigest}.json`,
    metrics: `build/metrics.${subjectDigest}.json`,
    renderReceipt: `build/render.${subjectDigest}.json`,
    mix: `build/mix.${subjectDigest}.wav`,
    proofs: tracks.map((track) => `proofs/t${String(track.index).padStart(3, "0")}-${track.role}-${track.id}.${subjectDigest}.wav`),
  };
}

function releaseOutputPaths(model) {
  return [
    `dist/${model.artifactId}.wav`,
    "evidence.audio.json",
    "review/music-review.md",
    "release.manifest.json",
  ];
}

export function createMusicReceipt(model) {
  const { subjectDigest } = sourcePaths(model);
  return {
    schemaVersion: 1,
    plugin: "tonejs-music-production",
    engine: MUSIC_ENGINE,
    artifactId: model?.artifactId,
    stage: "release",
    subjectDigest,
    outputs: Object.fromEntries(releaseOutputPaths(model).map((filePath) => [filePath, digestFor(model, filePath)])),
  };
}

export function validateMusicReceipt(model) {
  try {
    const actual = JSON.parse(model?.files?.["receipt.release.json"] ?? "");
    const expected = createMusicReceipt(model);
    return actual?.schemaVersion === expected.schemaVersion
      && actual?.plugin === expected.plugin
      && actual?.engine === expected.engine
      && actual?.artifactId === expected.artifactId
      && actual?.stage === expected.stage
      && actual?.subjectDigest === expected.subjectDigest
      && JSON.stringify(actual?.outputs) === JSON.stringify(expected.outputs);
  } catch {
    return false;
  }
}

function parseJson(files, filePath, findings) {
  if (typeof files[filePath] !== "string") {
    findings.push(finding("REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
    return null;
  }
  try {
    return JSON.parse(files[filePath]);
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
    "src/composition.mjs",
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

function validatePlan(files, findings) {
  const plan = parseJson(files, "plan.contract.json", findings);
  if (!plan) return;
  if (plan.schema !== "tonejs-music-plan/v1") findings.push(finding("PLAN_SCHEMA_INVALID", "plan.contract.json", "plan schema must be tonejs-music-plan/v1"));
  if (plan.targetStage !== "source" && plan.targetStage !== "release") findings.push(finding("PLAN_STAGE_INVALID", "plan.contract.json", "targetStage must be source or release"));
}

function validateProject(model, findings) {
  const project = model?.project;
  if (project?.schema !== "tonejs-music-project/v1") findings.push(finding("PROJECT_SCHEMA_INVALID", "music.project.json", "project schema must be tonejs-music-project/v1"));
  if (project?.artifactId !== model?.artifactId) findings.push(finding("ARTIFACT_ID_MISMATCH", "music.project.json", "artifactId must match the directory id"));
  if (project?.sampleRate !== 48000 || project?.channels !== 2) findings.push(finding("AUDIO_FORMAT_INVALID", "music.project.json", "v1 requires 48000 Hz stereo output"));
  if (!Number.isFinite(project?.tailSeconds) || project.tailSeconds < 0 || project.tailSeconds > 30) findings.push(finding("AUDIO_TAIL_INVALID", "music.project.json", "tailSeconds must be between 0 and 30"));
  const tracks = Array.isArray(project?.tracks) ? project.tracks : [];
  if (tracks.length === 0 || tracks.length > 8) findings.push(finding("TRACK_COUNT_INVALID", "music.project.json", "v1 requires between one and eight tracks"));
  tracks.forEach((track, offset) => {
    if (track?.index !== offset + 1) findings.push(finding("TRACK_SEQUENCE_INVALID", "music.project.json", "track indexes must be contiguous"));
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(track?.id ?? "") || !ROLE.test(track?.role ?? "")) findings.push(finding("TRACK_IDENTITY_INVALID", "music.project.json", "track id and role must use the v1 vocabulary"));
    if (typeof track?.instrument !== "string" || !/^src\/instruments\/[a-z0-9]+(?:-[a-z0-9]+)*\.mjs$/u.test(track.instrument)) {
      findings.push(finding("INSTRUMENT_PATH_INVALID", "music.project.json", "instrument must be a local src/instruments module"));
    } else if (!(track.instrument in model.files)) {
      findings.push(finding("INSTRUMENT_MISSING", track.instrument, "registered instrument module is missing"));
    } else if (INSTRUMENT_OWNER_VIOLATION.test(model.files[track.instrument])) {
      findings.push(finding("INSTRUMENT_OWNER_VIOLATION", track.instrument, "instrument modules may not own transport, destination, render, network, wall-clock, or randomness"));
    }
  });
}

function validateSourceArtifacts(model, findings) {
  const paths = sourcePaths(model);
  const outputs = [paths.score, paths.metrics, paths.mix, ...paths.proofs];
  for (const filePath of [...outputs, paths.renderReceipt]) {
    if (!(filePath in model.files)) findings.push(finding("SOURCE_ARTIFACT_MISSING", filePath, `${filePath} must match the current source digest`));
  }
  const score = parseJson(model.files, paths.score, findings);
  const metrics = parseJson(model.files, paths.metrics, findings);
  const renderReceipt = parseJson(model.files, paths.renderReceipt, findings);
  if (score && score.schema !== "tonejs-symbolic-score/v1") findings.push(finding("SCORE_SCHEMA_INVALID", paths.score, "score schema must be tonejs-symbolic-score/v1"));
  if (score && score.sourceDigest !== paths.subjectDigest) findings.push(finding("SCORE_DIGEST_INVALID", paths.score, "score must bind the current source digest"));
  if (metrics && metrics.schema !== "tonejs-music-metrics/v1") findings.push(finding("METRICS_SCHEMA_INVALID", paths.metrics, "metrics schema must be tonejs-music-metrics/v1"));
  if (metrics && metrics.sourceDigest !== paths.subjectDigest) findings.push(finding("METRICS_DIGEST_INVALID", paths.metrics, "metrics must bind the current source digest"));
  for (const filePath of [paths.mix, ...paths.proofs]) {
    const value = model.files[filePath];
    if (typeof value === "string" && !(value.startsWith("RIFF") && value.slice(8, 12) === "WAVE")) findings.push(finding("WAV_HEADER_INVALID", filePath, "rendered audio must have a RIFF/WAVE header"));
  }
  const expectedOutputs = Object.fromEntries(outputs.map((filePath) => [filePath, digestFor(model, filePath)]));
  if (renderReceipt && (renderReceipt.schema !== "tonejs-render-receipt/v1"
    || renderReceipt.sourceDigest !== paths.subjectDigest
    || JSON.stringify(renderReceipt.outputs) !== JSON.stringify(expectedOutputs))) {
    findings.push(finding("RENDER_RECEIPT_INVALID", paths.renderReceipt, "renderer receipt must bind current score, metrics, mix, and proofs"));
  }
}

export function validateMusicModel(model, { stage = "source" } = {}) {
  const findings = [];
  const files = model?.files ?? {};
  if (".music-delivery-journal.json" in files) findings.push(finding("MUTATION_JOURNAL_OPEN", ".music-delivery-journal.json", "an interrupted writer must be resumed or rolled back"));
  validateRequired(files, findings);
  validateGitignore(files, findings);
  validatePlan(files, findings);
  validateProject(model, findings);
  if (COMPOSITION_OWNER_VIOLATION.test(files["src/composition.mjs"] ?? "")) findings.push(finding("COMPOSITION_OWNER_VIOLATION", "src/composition.mjs", "composition config may not render, access network, wall-clock, or unseeded randomness"));
  if (stage !== "design") validateSourceArtifacts(model, findings);
  if (stage === "release") {
    for (const filePath of [...releaseOutputPaths(model), "receipt.release.json"]) {
      if (!(filePath in files)) findings.push(finding("RELEASE_PATH_MISSING", filePath, `${filePath} is required for release`));
    }
    if ("receipt.release.json" in files && !validateMusicReceipt(model)) findings.push(finding("RECEIPT_INVALID", "receipt.release.json", "release receipt must bind current sources and outputs"));
  }
  return findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));
}

export function evaluateMusicWrite({ relativePath = "", toolName = "", writer = "", cwd = "" } = {}) {
  const inside = projectInside(relativePath, cwd, "music");
  if (!inside) return { decision: "allow" };
  if (GENERATED_PATH.test(inside) && !writer.startsWith("tonejs-music-")) {
    return {
      decision: "deny",
      code: "PROTECTED_WRITER_REQUIRED",
      message: `${inside} must be written by a registered music tool, not ${toolName || "an unregistered tool"}`,
    };
  }
  return { decision: "allow" };
}
