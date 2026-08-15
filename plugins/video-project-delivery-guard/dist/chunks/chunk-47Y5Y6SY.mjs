// harness-source-hash: sha256:ab266d2f051b8be8a5488dd331bf6efacf12a101f36b81a6afe6e2f49f4de4de
import {
  assertVideoProjectRoot
} from "./chunk-ZS2FERKO.mjs";

// plugins/video-project-delivery-guard/src/lib/contract.ts
import { createHash } from "node:crypto";
import { posix as path } from "node:path";
var RENDER_PROOF_SCHEMA = "video-project-delivery-guard/render-proof/v1";
var PROBE_SCHEMA = "video-project-delivery-guard/probe-evidence/v1";
var AUDIO_EVIDENCE_SCHEMA = "video-project-delivery-guard/audio-evidence/v1";
var FRAME_EVIDENCE_SCHEMA = "video-project-delivery-guard/frame-evidence/v1";
var ACCESSIBILITY_EVIDENCE_SCHEMA = "video-project-delivery-guard/accessibility-evidence/v1";
var VIDEO_REVIEW_SCHEMA = "video-project-delivery-guard/video-review/v1";
var RELEASE_MANIFEST_SCHEMA = "video-project-delivery-guard/release-manifest/v1";
var PLUGIN = "video-project-delivery-guard";
var STAGES = /* @__PURE__ */ new Set(["source", "release"]);
var VISUAL_SOURCE = /^v(?<index>[0-9]{3})-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.f(?<start>[0-9]{6})-f(?<end>[0-9]{6})\.tsx$/u;
var AUDIO_SOURCE = /^a(?<index>[0-9]{3})-(?<role>music|voice|sfx|ambience)-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.f(?<start>[0-9]{6})-f(?<end>[0-9]{6})\.audio\.json$/u;
var GENERATED_PATH = /^(?:dist\/|evidence(?:\.|\/)|review\.video\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$|\.video-delivery-journal\.json$)/u;
var PROOF_MEDIA_PATH = /^src\/(?:visual\/.+\.mp4|audio\/.+\.wav)$/u;
var PROOF_RECORD_PATH = /^src\/(?:visual\/.+\.mp4\.proof\.json|audio\/.+\.wav\.proof\.json)$/u;
var CAPABILITY_PATH = /^\.tmp\/video-guard\/capability\.video-(?:render|probe|review|release)\.json$/u;
var VISUAL_OWNER = /(?:<\s*(?:Audio|Composition|Sequence|Series|TransitionSeries)\b|from\s+["']@remotion\/renderer["']|import\s*\(\s*["']@remotion\/renderer["']\s*\)|require\s*\(\s*["'](?:node:fs|node:child_process|@remotion\/renderer)["']\s*\)|\b(?:fetch|setTimeout|setInterval|XMLHttpRequest|WebSocket)\s*\(|\b(?:Date\.now|Math\.random)\s*\(|animation\s*:|https?:\/\/)/u;
var REQUIRED_PROJECT_PATHS = [
  ".gitignore",
  "package.json",
  "package-lock.json",
  "plan.contract.json",
  "plan.storyboard.json",
  "video.project.json",
  "src/index.ts",
  "src/Root.tsx",
  "src/Video.tsx",
  "src/timelines/VisualTimeline.tsx",
  "src/timelines/AudioTimeline.tsx",
  "src/visual/manifest.json",
  "src/audio/manifest.json"
];
var sha256 = (value) => createHash("sha256").update(value).digest("hex");
var finding = (code, filePath, message) => ({ code, path: filePath, message });
var hasFile = (model, filePath) => Object.prototype.hasOwnProperty.call(model?.files ?? {}, filePath);
var fileDigest = (model, filePath) => model?.digests?.[filePath] ?? sha256(model?.files?.[filePath] ?? "");
var isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var sixDigitHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
function isGeneratedSubjectPath(filePath) {
  return GENERATED_PATH.test(filePath) || PROOF_MEDIA_PATH.test(filePath) || PROOF_RECORD_PATH.test(filePath);
}
function computeVideoSubjectDigest(model) {
  const records = Object.keys(model?.digests ?? model?.files ?? {}).filter((filePath) => !isGeneratedSubjectPath(filePath)).sort((left, right) => left.localeCompare(right)).map((filePath) => `${filePath}\0${fileDigest(model, filePath)}
`).join("");
  return sha256(records);
}
function visualProofPaths(sourcePath, source) {
  const mediaPath = `${sourcePath.slice(0, -4)}.${sha256(source)}.mp4`;
  return { mediaPath, proofPath: `${mediaPath}.proof.json` };
}
function audioProofPaths(sourcePath, source) {
  const mediaPath = `${sourcePath.slice(0, -11)}.${sha256(source)}.wav`;
  return { mediaPath, proofPath: `${mediaPath}.proof.json` };
}
function finalRenderPaths(model) {
  const mediaPath = `dist/${model.artifactId}.mp4`;
  return { mediaPath, proofPath: `${mediaPath}.proof.json` };
}
function manifestUnits(model, kind) {
  try {
    const parsed = JSON.parse(model?.files?.[`src/${kind}/manifest.json`] ?? "");
    return Array.isArray(parsed?.units) ? parsed.units : [];
  } catch {
    return [];
  }
}
function releaseArtifactPaths(model) {
  const paths = [];
  for (const entry of manifestUnits(model, "visual")) {
    const sourcePath = `src/visual/${entry?.source ?? ""}`;
    if (typeof model?.files?.[sourcePath] === "string") paths.push(...Object.values(visualProofPaths(sourcePath, model.files[sourcePath])));
  }
  for (const entry of manifestUnits(model, "audio")) {
    const sourcePath = `src/audio/${entry?.source ?? ""}`;
    if (typeof model?.files?.[sourcePath] === "string") paths.push(...Object.values(audioProofPaths(sourcePath, model.files[sourcePath])));
  }
  paths.push(
    ...Object.values(finalRenderPaths(model)),
    "evidence.probe.json",
    "evidence.frames.json",
    "evidence.audio.json",
    "evidence.accessibility.json",
    "review.video.json",
    "release.manifest.json"
  );
  return [...new Set(paths)];
}
function createVideoReceipt(model) {
  return {
    schemaVersion: 2,
    plugin: PLUGIN,
    artifactId: model?.artifactId,
    stage: "release",
    subjectDigest: computeVideoSubjectDigest(model),
    outputs: Object.fromEntries(releaseArtifactPaths(model).map((filePath) => [filePath, fileDigest(model, filePath)]))
  };
}
function validateVideoReceipt(model) {
  try {
    const actual = JSON.parse(model?.files?.["receipt.release.json"] ?? "");
    const expected = createVideoReceipt(model);
    return actual?.schemaVersion === expected.schemaVersion && actual?.plugin === expected.plugin && actual?.artifactId === expected.artifactId && actual?.stage === expected.stage && actual?.subjectDigest === expected.subjectDigest && JSON.stringify(actual?.outputs) === JSON.stringify(expected.outputs);
  } catch {
    return false;
  }
}
function createVideoRenderProof(model, { kind, sourcePath = null, outputPath, media, script }) {
  return {
    schema: RENDER_PROOF_SCHEMA,
    plugin: PLUGIN,
    artifactId: model.artifactId,
    kind,
    subjectDigest: computeVideoSubjectDigest(model),
    source: sourcePath ? { path: sourcePath, sha256: fileDigest(model, sourcePath) } : null,
    output: { path: outputPath, sha256: fileDigest(model, outputPath) },
    media,
    writer: { capability: "video-render", script }
  };
}
function createVideoReleaseManifest(model) {
  const outputs = releaseArtifactPaths(model).filter((filePath) => filePath !== "release.manifest.json");
  return {
    schema: RELEASE_MANIFEST_SCHEMA,
    plugin: PLUGIN,
    artifactId: model.artifactId,
    subjectDigest: computeVideoSubjectDigest(model),
    outputs: Object.fromEntries(outputs.map((filePath) => [filePath, fileDigest(model, filePath)]))
  };
}
function parseJson(files, filePath, findings, code = "JSON_INVALID") {
  if (typeof files[filePath] !== "string") {
    findings.push(finding("REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
    return null;
  }
  try {
    return JSON.parse(files[filePath]);
  } catch {
    findings.push(finding(code, filePath, `${filePath} must contain valid JSON`));
    return null;
  }
}
function validateRequired(files, findings) {
  for (const filePath of REQUIRED_PROJECT_PATHS) {
    if (!(filePath in files)) findings.push(finding(filePath === "plan.contract.json" ? "PLAN_CONTRACT_MISSING" : "REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
  }
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
function validatePlan(model, stage, findings) {
  const plan = parseJson(model.files, "plan.contract.json", findings, "PLAN_CONTRACT_INVALID");
  if (plan && (!isObject(plan) || plan.artifactId !== model.artifactId || !STAGES.has(plan.targetStage))) findings.push(finding("PLAN_CONTRACT_INVALID", "plan.contract.json", "plan must bind artifactId and targetStage source|release"));
  if (!STAGES.has(stage)) findings.push(finding("STAGE_INVALID", "plan.contract.json", "closure stage must be source or release"));
}
function validateProjectConfig(model, findings) {
  const project = parseJson(model.files, "video.project.json", findings);
  if (!isObject(project)) return;
  if (project.artifactId !== model.artifactId) findings.push(finding("ARTIFACT_ID_MISMATCH", "video.project.json", "project artifactId must match directory id"));
  for (const key of ["durationInFrames", "fps", "width", "height"]) if (!Number.isInteger(project[key]) || project[key] <= 0) findings.push(finding("VIDEO_PROJECT_INVALID", "video.project.json", `${key} must be a positive integer`));
  if (typeof project.compositionId !== "string" || !project.compositionId.trim()) findings.push(finding("VIDEO_PROJECT_INVALID", "video.project.json", "compositionId must be a non-empty string"));
}
function validateToolchain(files, findings) {
  const pkg = parseJson(files, "package.json", findings);
  const lock = parseJson(files, "package-lock.json", findings);
  const requiredDependencies = ["remotion", "@remotion/cli", "react", "react-dom"];
  if (isObject(pkg)) {
    const dependencies = { ...pkg.dependencies ?? {}, ...pkg.devDependencies ?? {} };
    for (const name of requiredDependencies) if (typeof dependencies[name] !== "string") findings.push(finding("REMOTION_TOOLCHAIN_INVALID", "package.json", `${name} must be pinned by the artifact package`));
    for (const script of ["video:render:visual", "video:render:audio", "video:render:final"]) if (typeof pkg.scripts?.[script] !== "string" || !pkg.scripts[script].trim()) findings.push(finding("RENDER_SCRIPT_MISSING", "package.json", `${script} is required`));
  }
  if (isObject(lock) && (!Number.isInteger(lock.lockfileVersion) || !isObject(lock.packages))) findings.push(finding("PACKAGE_LOCK_INVALID", "package-lock.json", "npm lockfileVersion and packages map are required"));
  else if (isObject(lock)) {
    for (const name of requiredDependencies) if (typeof lock.packages[`node_modules/${name}`]?.version !== "string") findings.push(finding("PACKAGE_LOCK_DEPENDENCY_MISSING", "package-lock.json", `${name} must be present in the lockfile packages map`));
  }
}
function validateEntrypoints(files, findings) {
  const checks = [
    ["src/index.ts", /registerRoot\s*\(/u, "registerRoot"],
    ["src/Root.tsx", /<\s*Composition\b/u, "Composition"],
    ["src/Video.tsx", /<\s*VisualTimeline\b/u, "VisualTimeline"],
    ["src/Video.tsx", /<\s*AudioTimeline\b/u, "AudioTimeline"],
    ["src/timelines/VisualTimeline.tsx", /visual\/manifest\.json/u, "visual manifest"],
    ["src/timelines/AudioTimeline.tsx", /audio\/manifest\.json/u, "audio manifest"]
  ];
  for (const [filePath, pattern, label] of checks) if (typeof files[filePath] === "string" && !pattern.test(files[filePath])) findings.push(finding("REMOTION_ENTRYPOINT_INVALID", filePath, `${filePath} must wire ${label}`));
}
function interval(match, entry, duration, sourcePath, findings) {
  const start = Number(match.groups.start);
  const end = Number(match.groups.end);
  if (start !== entry.startFrame || end !== entry.endFrame) findings.push(finding("FRAME_PROJECTION_MISMATCH", sourcePath, "filename and manifest frame intervals must match"));
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= end || end > duration) findings.push(finding("FRAME_INTERVAL_INVALID", sourcePath, "frame interval must be a bounded half-open range"));
}
function relativeDependencies(files, sourcePath, visited = /* @__PURE__ */ new Set()) {
  if (visited.has(sourcePath)) return [];
  visited.add(sourcePath);
  const source = files[sourcePath];
  if (typeof source !== "string") return [];
  const closure = [{ path: sourcePath, source }];
  for (const match of source.matchAll(/(?:from\s+|import\s*\()\s*["'](?<specifier>\.[^"']+)["']/gu)) {
    const candidate = path.normalize(path.join(path.dirname(sourcePath), match.groups.specifier));
    const paths = [candidate, `${candidate}.ts`, `${candidate}.tsx`, path.join(candidate, "index.ts"), path.join(candidate, "index.tsx")];
    const resolved = paths.find((filePath) => typeof files[filePath] === "string");
    if (resolved) closure.push(...relativeDependencies(files, resolved, visited));
  }
  return closure;
}
function ownerViolation(files, sourcePath) {
  const forbidden = /* @__PURE__ */ new Set(["Audio", "Composition", "Sequence", "Series", "TransitionSeries"]);
  for (const { source } of relativeDependencies(files, sourcePath)) {
    if (VISUAL_OWNER.test(source)) return true;
    for (const match of source.matchAll(/import\s*\{(?<imports>[^}]+)\}\s*from\s*["']remotion["']/gu)) {
      const names = match.groups.imports.split(",").map((part) => part.trim().split(/\s+as\s+/u)[0]);
      if (names.some((name) => forbidden.has(name))) return true;
    }
    if (/import\s+\*\s+as\s+\w+\s+from\s*["']remotion["']/u.test(source)) return true;
  }
  return false;
}
function validRenderProof(model, { proofPath, kind, sourcePath, outputPath, startFrame, endFrame }) {
  let proof;
  try {
    proof = JSON.parse(model.files[proofPath] ?? "");
  } catch {
    return false;
  }
  const media = proof?.media;
  const expectedFrames = endFrame - startFrame;
  const outputOk = proof?.output?.path === outputPath && proof?.output?.sha256 === fileDigest(model, outputPath);
  const sourceOk = sourcePath === null ? proof?.source === null : proof?.source?.path === sourcePath && proof?.source?.sha256 === fileDigest(model, sourcePath);
  const videoFacts = media?.hasVideo === true && /(?:mp4|mov)/u.test(media?.format ?? "") && media?.width === model.project?.width && media?.height === model.project?.height;
  const kindFacts = kind === "audio" ? media?.hasVideo === false && media?.hasAudio === true && /wav/u.test(media?.format ?? "") && Number.isInteger(media?.sampleRate) && media.sampleRate > 0 && Number.isInteger(media?.channels) && media.channels > 0 : videoFacts && (kind === "visual" ? media?.hasAudio === false : media?.hasAudio === true);
  return proof?.schema === RENDER_PROOF_SCHEMA && proof?.plugin === PLUGIN && proof?.artifactId === model.artifactId && proof?.kind === kind && proof?.subjectDigest === computeVideoSubjectDigest(model) && sourceOk && outputOk && proof?.writer?.capability === "video-render" && proof?.writer?.script === `video:render:${kind === "final" ? "final" : kind}` && typeof proof?.createdAt === "string" && typeof proof?.sessionId === "string" && proof.sessionId !== "unknown" && typeof proof?.triggerFrom === "string" && isObject(media) && media.durationInFrames === expectedFrames && media.fps === model.project?.fps && kindFacts;
}
function validateVisual(model, entry, findings) {
  const match = typeof entry?.source === "string" ? entry.source.match(VISUAL_SOURCE) : null;
  const sourcePath = `src/visual/${entry?.source ?? "manifest.json"}`;
  if (!match) {
    findings.push(finding("VISUAL_NAME_INVALID", sourcePath, "visual source must encode a six-digit frame interval"));
    return;
  }
  if (Number(match.groups.index) !== entry.index) findings.push(finding("VISUAL_INDEX_MISMATCH", sourcePath, "visual filename index must match manifest"));
  interval(match, entry, model.project?.durationInFrames, sourcePath, findings);
  const source = model.files[sourcePath];
  if (typeof source !== "string") {
    findings.push(finding("VISUAL_SOURCE_MISSING", sourcePath, "visual source is missing"));
    return;
  }
  const { mediaPath, proofPath } = visualProofPaths(sourcePath, source);
  if (!hasFile(model, mediaPath)) findings.push(finding("VISUAL_PROOF_MISSING", mediaPath, "current source-hash muted MP4 proof is required"));
  if (!hasFile(model, proofPath) || !validRenderProof(model, { proofPath, kind: "visual", sourcePath, outputPath: mediaPath, startFrame: entry.startFrame, endFrame: entry.endFrame })) findings.push(finding("VISUAL_RENDER_PROOF_INVALID", proofPath, "visual proof must carry a current structured render receipt"));
  if (ownerViolation(model.files, sourcePath)) findings.push(finding("VISUAL_OWNER_VIOLATION", sourcePath, "visual unit closure may not own audio, composition, global scheduling, I/O, network, or wall-clock randomness"));
}
function validateAudio(model, entry, findings) {
  const match = typeof entry?.source === "string" ? entry.source.match(AUDIO_SOURCE) : null;
  const sourcePath = `src/audio/${entry?.source ?? "manifest.json"}`;
  if (!match) {
    findings.push(finding("AUDIO_NAME_INVALID", sourcePath, "audio binding must encode role and six-digit frame interval"));
    return;
  }
  if (Number(match.groups.index) !== entry.index || match.groups.role !== entry.role) findings.push(finding("AUDIO_MANIFEST_MISMATCH", sourcePath, "audio filename must match index and role"));
  interval(match, entry, model.project?.durationInFrames, sourcePath, findings);
  const binding = parseJson(model.files, sourcePath, findings);
  if (!binding) return;
  if (binding.startFrame !== entry.startFrame || binding.endFrame !== entry.endFrame || binding.role !== entry.role) findings.push(finding("AUDIO_PROJECTION_MISMATCH", sourcePath, "audio binding and manifest must match"));
  const normalizedAsset = typeof binding.asset === "string" ? path.normalize(binding.asset) : "";
  if (!normalizedAsset.startsWith("public/") || normalizedAsset.includes("../") || normalizedAsset !== binding.asset) findings.push(finding("AUDIO_ASSET_INVALID", sourcePath, "audio asset must be a normalized path below public/"));
  if (!normalizedAsset || !hasFile(model, normalizedAsset)) findings.push(finding("AUDIO_ASSET_MISSING", normalizedAsset || sourcePath, "registered audio asset must exist in the artifact"));
  const { mediaPath, proofPath } = audioProofPaths(sourcePath, model.files[sourcePath]);
  if (!hasFile(model, mediaPath)) findings.push(finding("AUDIO_PROOF_MISSING", mediaPath, "current source-hash WAV proof is required"));
  if (!hasFile(model, proofPath) || !validRenderProof(model, { proofPath, kind: "audio", sourcePath, outputPath: mediaPath, startFrame: entry.startFrame, endFrame: entry.endFrame })) findings.push(finding("AUDIO_RENDER_PROOF_INVALID", proofPath, "audio proof must carry a current structured render receipt"));
}
function validateManifest(entries, kind, findings) {
  if (!Array.isArray(entries) || entries.length === 0) {
    findings.push(finding(`${kind.toUpperCase()}_MANIFEST_INVALID`, `src/${kind}/manifest.json`, `${kind} manifest units must be a non-empty array`));
    return;
  }
  const ids = /* @__PURE__ */ new Set();
  const sources = /* @__PURE__ */ new Set();
  entries.forEach((entry, offset) => {
    if (entry?.index !== offset + 1 || typeof entry?.id !== "string" || !entry.id || ids.has(entry.id) || sources.has(entry?.source)) findings.push(finding(`${kind.toUpperCase()}_SEQUENCE_INVALID`, `src/${kind}/manifest.json`, `${kind} indexes, ids, and sources must be unique and contiguous`));
    ids.add(entry?.id);
    sources.add(entry?.source);
  });
}
function evidenceObject(model, filePath) {
  try {
    const value = JSON.parse(model.files[filePath] ?? "");
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}
function validEvidenceBase(model, value, schema) {
  const finalPath = finalRenderPaths(model).mediaPath;
  const expectedCapability = [PROBE_SCHEMA, AUDIO_EVIDENCE_SCHEMA].includes(schema) ? "video-probe" : "video-review";
  return value?.schema === schema && value?.plugin === PLUGIN && value?.artifactId === model.artifactId && value?.subjectDigest === computeVideoSubjectDigest(model) && value?.output?.path === finalPath && value?.output?.sha256 === fileDigest(model, finalPath) && value?.capability === expectedCapability && typeof value?.createdAt === "string" && typeof value?.sessionId === "string" && value.sessionId !== "unknown" && typeof value?.triggerFrom === "string";
}
function validateReleaseEvidence(model, findings) {
  const { mediaPath, proofPath } = finalRenderPaths(model);
  if (!hasFile(model, proofPath) || !validRenderProof(model, { proofPath, kind: "final", sourcePath: null, outputPath: mediaPath, startFrame: 0, endFrame: model.project?.durationInFrames })) findings.push(finding("FINAL_RENDER_PROOF_INVALID", proofPath, "final MP4 requires a current structured render proof"));
  const probe = evidenceObject(model, "evidence.probe.json");
  if (!validEvidenceBase(model, probe, PROBE_SCHEMA) || !isObject(probe?.video) || probe.video.durationInFrames !== model.project?.durationInFrames || probe.video.fps !== model.project?.fps || probe.video.width !== model.project?.width || probe.video.height !== model.project?.height || probe.video.hasVideo !== true || probe.video.hasAudio !== true || !/(?:mp4|mov)/u.test(probe.video.format ?? "")) findings.push(finding("PROBE_EVIDENCE_INVALID", "evidence.probe.json", "probe evidence must bind measured final-video facts"));
  const audio = evidenceObject(model, "evidence.audio.json");
  if (!validEvidenceBase(model, audio, AUDIO_EVIDENCE_SCHEMA) || audio?.audio?.present !== true || !Number.isInteger(audio?.audio?.sampleRate) || audio.audio.sampleRate <= 0 || !Number.isInteger(audio?.audio?.channels) || audio.audio.channels <= 0 || audio?.audio?.durationInFrames !== model.project?.durationInFrames) findings.push(finding("AUDIO_EVIDENCE_INVALID", "evidence.audio.json", "audio evidence must bind a measured audio stream"));
  const frames = evidenceObject(model, "evidence.frames.json");
  const frameList = Array.isArray(frames?.frames) ? frames.frames : [];
  const frameIndexes = frameList.map((item) => item?.frame);
  if (!validEvidenceBase(model, frames, FRAME_EVIDENCE_SCHEMA) || frames?.tool?.name !== "ffmpeg" || typeof frames?.tool?.version !== "string" || !frames.tool.version || frameList.length < 3 || !frameList.every((item) => Number.isInteger(item?.frame) && item.frame >= 0 && item.frame < model.project?.durationInFrames && sixDigitHash(item?.sha256)) || new Set(frameIndexes).size !== frameIndexes.length || !frameIndexes.includes(0) || !frameIndexes.includes(model.project?.durationInFrames - 1)) findings.push(finding("FRAME_EVIDENCE_INVALID", "evidence.frames.json", "frame evidence must bind unique start, interior, and final extracted frame hashes"));
  const accessibility = evidenceObject(model, "evidence.accessibility.json");
  if (!validEvidenceBase(model, accessibility, ACCESSIBILITY_EVIDENCE_SCHEMA) || accessibility?.verdict !== "pass" || !sixDigitHash(accessibility?.reviewInputSha256) || !["captionsReviewed", "flashingReviewed", "contrastReviewed"].every((key) => accessibility?.checks?.[key] === true)) findings.push(finding("ACCESSIBILITY_EVIDENCE_INVALID", "evidence.accessibility.json", "accessibility evidence requires explicit passing checks"));
  const review = evidenceObject(model, "review.video.json");
  const finalProof = evidenceObject(model, proofPath);
  if (!validEvidenceBase(model, review, VIDEO_REVIEW_SCHEMA) || review?.verdict !== "pass" || !sixDigitHash(review?.reviewInputSha256) || review?.reviewInputSha256 !== accessibility?.reviewInputSha256 || !["human", "independent-agent"].includes(review?.reviewer?.kind) || typeof review?.reviewer?.id !== "string" || typeof review?.reviewer?.sessionId !== "string" || review?.reviewer?.sessionId !== review?.sessionId || review?.reviewer?.sessionId === finalProof?.sessionId || review?.frameEvidenceSha256 !== fileDigest(model, "evidence.frames.json") || review?.accessibilityEvidenceSha256 !== fileDigest(model, "evidence.accessibility.json")) findings.push(finding("VIDEO_REVIEW_INVALID", "review.video.json", "video review must be an independent passing review bound to frame and accessibility evidence"));
  const manifest = evidenceObject(model, "release.manifest.json");
  const expectedManifest = createVideoReleaseManifest(model);
  if (JSON.stringify(manifest) !== JSON.stringify(expectedManifest)) findings.push(finding("RELEASE_MANIFEST_INVALID", "release.manifest.json", "release manifest must bind the current subject and every delivery output"));
}
function validateVideoModel(model, { stage } = {}) {
  const findings = [];
  const files = model?.files ?? {};
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(model?.artifactId ?? "")) findings.push(finding("ARTIFACT_DIRECTORY_INVALID", ".", "video artifact directory must use a kebab-case id"));
  if (hasFile(model, ".video-delivery-journal.json")) findings.push(finding("MUTATION_JOURNAL_OPEN", ".video-delivery-journal.json", "an interrupted generated writer must be resumed or rolled back"));
  validateRequired(files, findings);
  validateArtifactGitignore(files, findings);
  validatePlan(model, stage, findings);
  validateProjectConfig(model, findings);
  validateToolchain(files, findings);
  validateEntrypoints(files, findings);
  const visualManifest = parseJson(files, "src/visual/manifest.json", findings);
  const audioManifest = parseJson(files, "src/audio/manifest.json", findings);
  const visual = Array.isArray(visualManifest?.units) ? visualManifest.units : [];
  const audio = Array.isArray(audioManifest?.units) ? audioManifest.units : [];
  validateManifest(visual, "visual", findings);
  validateManifest(audio, "audio", findings);
  visual.forEach((entry) => validateVisual(model, entry, findings));
  audio.forEach((entry) => validateAudio(model, entry, findings));
  if (stage === "release") {
    for (const filePath of [...releaseArtifactPaths(model), "receipt.release.json"]) if (!hasFile(model, filePath)) findings.push(finding("RELEASE_PATH_MISSING", filePath, `${filePath} is required for release`));
    validateReleaseEvidence(model, findings);
    if (hasFile(model, "receipt.release.json") && !validateVideoReceipt(model)) findings.push(finding("RECEIPT_INVALID", "receipt.release.json", "release receipt must bind current video sources and outputs"));
  }
  return findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));
}
var WRITER_PATHS = {
  "video-render": /^(?:src\/visual\/.*\.mp4(?:\.proof\.json)?|src\/audio\/.*\.wav(?:\.proof\.json)?|dist\/[^/]+\.mp4(?:\.proof\.json)?)$/u,
  "video-probe": /^evidence\.(?:probe|audio)\.json$/u,
  "video-review": /^(?:evidence\.(?:frames|accessibility)\.json|review\.video\.json)$/u,
  "video-release": /^(?:release\.manifest\.json|receipt\.release\.json|\.video-delivery-journal\.json)$/u
};
function evaluateVideoWrite({ relativePath = "", toolName = "", writer = "" } = {}) {
  const normalized = String(relativePath).replaceAll("\\", "/");
  const match = normalized.match(/(?:^|\/)artifacts\/video\/[^/]+\/(?<inside>.+)$/u);
  if (!match) return { decision: "allow" };
  const inside = match.groups.inside;
  const protectedPath = GENERATED_PATH.test(inside) || PROOF_MEDIA_PATH.test(inside) || PROOF_RECORD_PATH.test(inside) || CAPABILITY_PATH.test(inside);
  if (!protectedPath) return { decision: "allow" };
  if (WRITER_PATHS[writer]?.test(inside)) return { decision: "allow", capability: writer };
  return { decision: "deny", code: "PROTECTED_WRITER_REQUIRED", message: `${inside} requires its exact video writer capability, not ${toolName || "an unregistered tool"}` };
}

// plugins/video-project-delivery-guard/src/lib/capability.ts
import { createHash as createHash2, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
var TTL_MS = 3e4;
var grantPath = (root, capability) => join(root, ".tmp", "video-guard", `capability.${capability}.json`);
var argvDigest = (argv) => createHash2("sha256").update(JSON.stringify(argv)).digest("hex");
async function issueWriterCapability({ root: rawRoot, capability, argv, sessionId, triggerFrom }) {
  const root = assertVideoProjectRoot(rawRoot);
  if (!/^video-(?:render|probe|review|release)$/u.test(capability)) throw new Error("WRITER_CAPABILITY_INVALID");
  if (typeof sessionId !== "string" || !sessionId || sessionId === "unknown") throw new Error("WRITER_SESSION_MISSING");
  const directory = join(root, ".tmp", "video-guard");
  const target = grantPath(root, capability);
  await mkdir(directory, { recursive: true });
  try {
    const existing = JSON.parse(await readFile(target, "utf8"));
    if (Number(existing?.expiresAt) >= Date.now()) throw new Error("WRITER_CAPABILITY_BUSY");
    await unlink(target);
  } catch (error) {
    if (error?.code !== "ENOENT" && error?.message !== "WRITER_CAPABILITY_BUSY" && !(error instanceof SyntaxError)) throw error;
    if (error?.message === "WRITER_CAPABILITY_BUSY") throw error;
    if (error instanceof SyntaxError) await unlink(target).catch(() => {
    });
  }
  const grant = {
    schema: "video-project-delivery-guard/writer-capability/v1",
    id: randomUUID(),
    capability,
    root,
    argvSha256: argvDigest(argv),
    sessionId,
    triggerFrom: triggerFrom || "PreToolUse",
    issuedAt: (/* @__PURE__ */ new Date()).toISOString(),
    expiresAt: Date.now() + TTL_MS
  };
  await writeFile(target, `${JSON.stringify(grant)}
`, { flag: "wx", mode: 384 });
  await chmod(target, 384);
  return grant;
}
async function consumeWriterCapability({ root: rawRoot, capability, argv }) {
  const root = assertVideoProjectRoot(rawRoot);
  const target = grantPath(root, capability);
  let bytes;
  try {
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("WRITER_CAPABILITY_INVALID");
    bytes = await readFile(target);
    await unlink(target);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error("WRITER_CAPABILITY_MISSING");
    throw error;
  }
  let grant;
  try {
    grant = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("WRITER_CAPABILITY_INVALID");
  }
  if (grant?.schema !== "video-project-delivery-guard/writer-capability/v1" || grant?.capability !== capability || grant?.root !== root || grant?.argvSha256 !== argvDigest(argv) || !Number.isFinite(grant?.expiresAt) || grant.expiresAt < Date.now() || typeof grant?.sessionId !== "string" || !grant.sessionId || grant.sessionId === "unknown") throw new Error("WRITER_CAPABILITY_INVALID");
  return grant;
}
function processWriterArgv() {
  return [resolve(process.argv[1]), ...process.argv.slice(2)];
}

export {
  PROBE_SCHEMA,
  AUDIO_EVIDENCE_SCHEMA,
  FRAME_EVIDENCE_SCHEMA,
  ACCESSIBILITY_EVIDENCE_SCHEMA,
  VIDEO_REVIEW_SCHEMA,
  computeVideoSubjectDigest,
  visualProofPaths,
  audioProofPaths,
  finalRenderPaths,
  createVideoReceipt,
  validateVideoReceipt,
  createVideoRenderProof,
  createVideoReleaseManifest,
  validateVideoModel,
  evaluateVideoWrite,
  issueWriterCapability,
  consumeWriterCapability,
  processWriterArgv
};
