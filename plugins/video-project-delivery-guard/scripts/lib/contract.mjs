import { createHash } from "node:crypto";

const VISUAL_SOURCE = /^v(?<index>[0-9]{3})-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.f(?<start>[0-9]{6})-f(?<end>[0-9]{6})\.tsx$/u;
const AUDIO_SOURCE = /^a(?<index>[0-9]{3})-(?<role>music|voice|sfx|ambience)-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.f(?<start>[0-9]{6})-f(?<end>[0-9]{6})\.audio\.json$/u;
const GENERATED_PATH = /^(?:dist\/|evidence\.[^/]+\.json$|review\.video\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$)/u;
const VISUAL_OWNER = /(?:<\s*Audio\b|<\s*Composition\b|<\s*(?:Sequence|Series|TransitionSeries)\b|from\s+["']@remotion\/renderer["']|\b(?:fetch|setTimeout|setInterval)\s*\(|\b(?:Date\.now|Math\.random)\s*\(|animation\s*:|https?:\/\/)/u;
const RECEIPT_EXCLUDED_PATH = /^(?:dist\/|evidence(?:\.|\/)|review\.video\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$|\.video-delivery-journal\.json$)/u;
const PROOF_PATH = /^src\/(?:visual\/.+\.mp4|audio\/.+\.wav)$/u;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const finding = (code, path, message) => ({ code, path, message });
const fileDigest = (model, filePath) => model?.digests?.[filePath] ?? sha256(model?.files?.[filePath] ?? "");

export function computeVideoSubjectDigest(model) {
  const records = Object.entries(model?.files ?? {})
    .filter(([filePath, value]) => typeof value === "string" && !RECEIPT_EXCLUDED_PATH.test(filePath) && !PROOF_PATH.test(filePath))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath]) => `${filePath}\0${fileDigest(model, filePath)}\n`)
    .join("");
  return sha256(records);
}

function videoOutputPaths(model) {
  return [
    `dist/${model.artifactId}.mp4`,
    "evidence.probe.json",
    "evidence.frames.json",
    "evidence.audio.json",
    "evidence.accessibility.json",
    "review.video.json",
    "release.manifest.json",
  ];
}

export function createVideoReceipt(model) {
  return {
    schemaVersion: 1,
    plugin: "video-project-delivery-guard",
    artifactId: model?.artifactId,
    stage: "release",
    subjectDigest: computeVideoSubjectDigest(model),
    outputs: Object.fromEntries(videoOutputPaths(model).map((filePath) => [filePath, fileDigest(model, filePath)])),
  };
}

export function validateVideoReceipt(model) {
  try {
    const actual = JSON.parse(model?.files?.["receipt.release.json"] ?? "");
    const expected = createVideoReceipt(model);
    return actual?.schemaVersion === expected.schemaVersion
      && actual?.plugin === expected.plugin
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
  try { return JSON.parse(files[filePath]); } catch {
    findings.push(finding("JSON_INVALID", filePath, `${filePath} must contain valid JSON`));
    return null;
  }
}

function validateRequired(files, findings) {
  for (const filePath of [
    ".gitignore", "package.json", "package-lock.json", "plan.contract.json", "plan.storyboard.json",
    "video.project.json", "src/index.ts", "src/Root.tsx", "src/Video.tsx",
    "src/timelines/VisualTimeline.tsx", "src/timelines/AudioTimeline.tsx",
    "src/visual/manifest.json", "src/audio/manifest.json",
  ]) if (!(filePath in files)) findings.push(finding("REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
}

function validateArtifactGitignore(files, findings) {
  const text = files[".gitignore"];
  if (typeof text !== "string") return;
  text.split(/\r?\n/u).forEach((raw, offset) => {
    const line = raw.trim();
    const normalized = line.replace(/^\//u, "");
    if (line && !line.startsWith("#") && !line.startsWith("!") && (/^(?:dist|build|evidence)(?:\/|$)/u.test(normalized) || /^(?:receipt|review|release)(?:\.|\/|$)/u.test(normalized) || /^(?:\*\*\/)?\*\.(?:png|svg|pdf|pptx|mp4|wav)$/u.test(normalized))) findings.push(finding("DELIVERY_PATH_IGNORED", `.gitignore:${offset + 1}`, `artifact delivery path must not be ignored: ${line}`));
  });
}

function interval(match, entry, duration, sourcePath, findings) {
  const start = Number(match.groups.start);
  const end = Number(match.groups.end);
  if (start !== entry.startFrame || end !== entry.endFrame) findings.push(finding("FRAME_PROJECTION_MISMATCH", sourcePath, "filename and manifest frame intervals must match"));
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= end || end > duration) findings.push(finding("FRAME_INTERVAL_INVALID", sourcePath, "frame interval must be a bounded half-open range"));
}

function validateVisual(model, entry, findings) {
  const match = typeof entry?.source === "string" ? entry.source.match(VISUAL_SOURCE) : null;
  const sourcePath = `src/visual/${entry?.source ?? "manifest.json"}`;
  if (!match) { findings.push(finding("VISUAL_NAME_INVALID", sourcePath, "visual source must encode a six-digit frame interval")); return; }
  if (Number(match.groups.index) !== entry.index) findings.push(finding("VISUAL_INDEX_MISMATCH", sourcePath, "visual filename index must match manifest"));
  interval(match, entry, model.project?.durationInFrames, sourcePath, findings);
  const source = model.files[sourcePath];
  if (typeof source !== "string") { findings.push(finding("VISUAL_SOURCE_MISSING", sourcePath, "visual source is missing")); return; }
  const proof = `${sourcePath.slice(0, -4)}.${sha256(source)}.mp4`;
  if (!(proof in model.files)) findings.push(finding("VISUAL_PROOF_MISSING", proof, "current source-hash muted MP4 proof is required"));
  if (VISUAL_OWNER.test(source)) findings.push(finding("VISUAL_OWNER_VIOLATION", sourcePath, "visual unit may not own audio, composition, or global scheduling"));
}

function validateAudio(model, entry, findings) {
  const match = typeof entry?.source === "string" ? entry.source.match(AUDIO_SOURCE) : null;
  const sourcePath = `src/audio/${entry?.source ?? "manifest.json"}`;
  if (!match) { findings.push(finding("AUDIO_NAME_INVALID", sourcePath, "audio binding must encode role and six-digit frame interval")); return; }
  if (Number(match.groups.index) !== entry.index || match.groups.role !== entry.role) findings.push(finding("AUDIO_MANIFEST_MISMATCH", sourcePath, "audio filename must match index and role"));
  interval(match, entry, model.project?.durationInFrames, sourcePath, findings);
  const binding = parseJson(model.files, sourcePath, findings);
  if (!binding) return;
  if (binding.startFrame !== entry.startFrame || binding.endFrame !== entry.endFrame || binding.role !== entry.role) findings.push(finding("AUDIO_PROJECTION_MISMATCH", sourcePath, "audio binding and manifest must match"));
  if (typeof binding.asset !== "string" || !binding.asset.startsWith("public/") || /^https?:/u.test(binding.asset)) findings.push(finding("AUDIO_ASSET_INVALID", sourcePath, "audio asset must be a registered local public path"));
  const proof = `${sourcePath.slice(0, -11)}.${sha256(model.files[sourcePath])}.wav`;
  if (!(proof in model.files)) findings.push(finding("AUDIO_PROOF_MISSING", proof, "current source-hash WAV proof is required"));
}

export function validateVideoModel(model, { stage = "source" } = {}) {
  const findings = [];
  const files = model?.files ?? {};
  if (".video-delivery-journal.json" in files) findings.push(finding("MUTATION_JOURNAL_OPEN", ".video-delivery-journal.json", "an interrupted generated writer must be resumed or rolled back"));
  validateRequired(files, findings);
  validateArtifactGitignore(files, findings);
  if (model?.project?.artifactId !== model?.artifactId) findings.push(finding("ARTIFACT_ID_MISMATCH", "video.project.json", "project artifactId must match directory id"));
  const duration = model?.project?.durationInFrames;
  if (!Number.isInteger(duration) || duration <= 0) findings.push(finding("DURATION_INVALID", "video.project.json", "durationInFrames must be a positive integer"));
  const visualManifest = parseJson(files, "src/visual/manifest.json", findings);
  const audioManifest = parseJson(files, "src/audio/manifest.json", findings);
  const visual = Array.isArray(visualManifest?.units) ? visualManifest.units : [];
  const audio = Array.isArray(audioManifest?.units) ? audioManifest.units : [];
  visual.forEach((entry, offset) => {
    if (entry?.index !== offset + 1) findings.push(finding("VISUAL_SEQUENCE_INVALID", "src/visual/manifest.json", "visual indexes must be contiguous"));
    validateVisual(model, entry, findings);
  });
  audio.forEach((entry, offset) => {
    if (entry?.index !== offset + 1) findings.push(finding("AUDIO_SEQUENCE_INVALID", "src/audio/manifest.json", "audio indexes must be contiguous"));
    validateAudio(model, entry, findings);
  });
  if (stage === "release") {
    for (const filePath of [...videoOutputPaths(model), "receipt.release.json"]) {
      if (!(filePath in files)) findings.push(finding("RELEASE_PATH_MISSING", filePath, `${filePath} is required for release`));
    }
    if ("receipt.release.json" in files && !validateVideoReceipt(model)) findings.push(finding("RECEIPT_INVALID", "receipt.release.json", "release receipt must bind current video sources and outputs"));
  }
  return findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));
}

export function evaluateVideoWrite({ relativePath = "", toolName = "", writer = "" } = {}) {
  const normalized = relativePath.replaceAll("\\", "/");
  const match = normalized.match(/(?:^|\/)artifacts\/video\/[^/]+\/(?<inside>.+)$/u);
  if (!match) return { decision: "allow" };
  const inside = match.groups.inside;
  const proof = /^(?:src\/visual\/.*\.mp4|src\/audio\/.*\.wav)$/u.test(inside);
  if ((GENERATED_PATH.test(inside) || proof) && !writer.startsWith("video-")) return { decision: "deny", code: "PROTECTED_WRITER_REQUIRED", message: `${inside} must be written by a video guard tool, not ${toolName || "an unregistered tool"}` };
  return { decision: "allow" };
}
