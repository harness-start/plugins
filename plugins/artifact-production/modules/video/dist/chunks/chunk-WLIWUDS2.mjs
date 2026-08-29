// harness-source-hash: sha256:e43e79a4b1e44439529b9ae9133002565cac23a9b902524ba2c130520c2c6331
import {
  SHOT_LIBRARY_UPSTREAM_COMMIT,
  getShotRecipe
} from "./chunk-BUPZJ3VI.mjs";
import {
  assertVideoProjectRoot
} from "./chunk-XK7SS2NG.mjs";

// plugins/artifact-production/modules/video/src/lib/capability.ts
import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
var TTL_MS = 3e4;
var grantPath = (root, capability) => join(root, ".tmp", "video-guard", `capability.${capability}.json`);
var argvDigest = (argv) => createHash("sha256").update(JSON.stringify(argv)).digest("hex");
function errorCode(error) {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : void 0;
}
function errorMessage(error) {
  return typeof error === "object" && error !== null && "message" in error ? String(error.message) : void 0;
}
async function issueWriterCapability({ root: rawRoot, capability, argv, sessionId, triggerFrom }) {
  const root = assertVideoProjectRoot(rawRoot);
  if (!/^video-(?:init|admit|render|probe|review|release|shot-stage)$/u.test(capability)) throw new Error("WRITER_CAPABILITY_INVALID");
  if (typeof sessionId !== "string" || !sessionId || sessionId === "unknown") throw new Error("WRITER_SESSION_MISSING");
  const directory = join(root, ".tmp", "video-guard");
  const target = grantPath(root, capability);
  await mkdir(directory, { recursive: true });
  try {
    const existing = JSON.parse(await readFile(target, "utf8"));
    const expiresAt = typeof existing === "object" && existing !== null && "expiresAt" in existing ? Number(existing.expiresAt) : Number.NaN;
    if (expiresAt >= Date.now()) throw new Error("WRITER_CAPABILITY_BUSY");
    await unlink(target);
  } catch (error) {
    if (errorCode(error) !== "ENOENT" && errorMessage(error) !== "WRITER_CAPABILITY_BUSY" && !(error instanceof SyntaxError)) throw error;
    if (errorMessage(error) === "WRITER_CAPABILITY_BUSY") throw error;
    if (error instanceof SyntaxError) await unlink(target).catch(() => {
    });
  }
  const grant = {
    schema: "video-production/writer-capability/v1",
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
    if (errorCode(error) === "ENOENT") throw new Error("WRITER_CAPABILITY_MISSING");
    throw error;
  }
  let grant;
  try {
    grant = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("WRITER_CAPABILITY_INVALID");
  }
  if (typeof grant !== "object" || grant === null) throw new Error("WRITER_CAPABILITY_INVALID");
  const record = grant;
  if (record.schema !== "video-production/writer-capability/v1" || record.capability !== capability || record.root !== root || record.argvSha256 !== argvDigest(argv) || !Number.isFinite(record.expiresAt) || record.expiresAt < Date.now() || typeof record.sessionId !== "string" || !record.sessionId || record.sessionId === "unknown") throw new Error("WRITER_CAPABILITY_INVALID");
  return record;
}
function processWriterArgv() {
  return [resolve(process.argv[1] ?? ""), ...process.argv.slice(2)];
}

// plugins/artifact-production/modules/video/src/lib/contract.ts
import { createHash as createHash2 } from "node:crypto";
import { posix as path } from "node:path";
var RENDER_PROOF_SCHEMA = "video-production/render-proof/v1";
var PROBE_SCHEMA = "video-production/probe-evidence/v1";
var AUDIO_EVIDENCE_SCHEMA = "video-production/audio-evidence/v1";
var MOTION_EVIDENCE_SCHEMA = "video-production/motion-evidence/v1";
var CAPTION_EVIDENCE_SCHEMA = "video-production/caption-evidence/v1";
var REFERENCE_EVIDENCE_SCHEMA = "video-production/reference-evidence/v1";
var SHOT_EVIDENCE_SCHEMA = "video-production/shot-evidence/v1";
var FRAME_EVIDENCE_SCHEMA = "video-production/frame-evidence/v1";
var ACCESSIBILITY_EVIDENCE_SCHEMA = "video-production/accessibility-evidence/v1";
var VIDEO_REVIEW_SCHEMA = "video-production/video-review/v2";
var REVIEW_INPUT_SCHEMA = "video-production/review-input/v2";
var RELEASE_MANIFEST_SCHEMA = "video-production/release-manifest/v2";
var PLAN_SCHEMA = "video-production/plan/v2";
var SHOT_PLAN_SCHEMA = "video-production/shot-plan/v1";
var DIRECTION_SCHEMA = "video-production/direction/v1";
var SCRIPT_SCHEMA = "video-production/script/v1";
var STORYBOARD_SCHEMA = "video-production/storyboard/v2";
var SKILL_COMPOSITION_SCHEMA = "video-production/skill-composition/v1";
var ASSET_MANIFEST_SCHEMA = "video-production/assets/v2";
var APPROVALS_SCHEMA = "video-production/approvals/v1";
var REFERENCES_SCHEMA = "video-production/references/v1";
var DESIGN_SYSTEM_SCHEMA = "video-production/design-system/v1";
var PROJECT_SCHEMA = "video-production/project/v2";
var BLACK_FRAME_THRESHOLD = Object.freeze({ yAvgMax: 20, yMaxMax: 32 });
var VIDEO_PROFILES = [
  "motion-explainer",
  "product-promo",
  "short-form",
  "talking-head",
  "reference-led",
  "micro-drama"
];
var VIDEO_STAGES = [
  "source",
  "direction",
  "storyboard",
  "assets",
  "composition",
  "render",
  "probe",
  "review",
  "release"
];
var PLUGIN = "video-production";
var STAGES = new Set(VIDEO_STAGES);
var STAGE_RANK = Object.fromEntries(VIDEO_STAGES.map((stage, index) => [stage, index]));
var PROFILES = new Set(VIDEO_PROFILES);
var VISUAL_SOURCE = /^v(?<index>[0-9]{3})-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.f(?<start>[0-9]{6})-f(?<end>[0-9]{6})\.tsx$/u;
var AUDIO_SOURCE = /^a(?<index>[0-9]{3})-(?<role>music|voice|sfx|ambience)-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.f(?<start>[0-9]{6})-f(?<end>[0-9]{6})\.audio\.json$/u;
var CAPTION_SOURCE = /^c(?<index>[0-9]{3})-(?<role>dialogue|narration|label)-(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.f(?<start>[0-9]{6})-f(?<end>[0-9]{6})\.caption\.json$/u;
var GENERATED_PATH = /^(?:dist\/|evidence(?:\.|\/)|review\.video\.json$|release\.manifest\.json$|receipt\.[^/]+\.json$|\.video-delivery-journal\.json$)/u;
var ADMITTED_ASSET_PATH = /^public\/admitted\//u;
var PROOF_MEDIA_PATH = /^src\/(?:visual\/.+\.mp4|audio\/.+\.wav)$/u;
var PROOF_RECORD_PATH = /^src\/(?:visual\/.+\.mp4\.proof\.json|audio\/.+\.wav\.proof\.json)$/u;
var CAPABILITY_PATH = /^\.tmp\/video-guard\/capability\.video-(?:init|admit|render|probe|review|release|shot-stage)\.json$/u;
var VISUAL_OWNER = /(?:<\s*(?:Audio|Composition|Sequence|Series|TransitionSeries)\b|from\s+["']@remotion\/renderer["']|import\s*\(\s*["']@remotion\/renderer["']\s*\)|require\s*\(\s*["'](?:node:fs|node:child_process|@remotion\/renderer)["']\s*\)|\b(?:fetch|setTimeout|setInterval|XMLHttpRequest|WebSocket)\s*\(|\b(?:Date\.now|Math\.random)\s*\(|animation\s*:|https?:\/\/)/u;
var REQUIRED_PROJECT_PATHS = [
  ".gitignore",
  "package.json",
  "package-lock.json",
  "plan.contract.json",
  "plan.storyboard.json",
  "plan.direction.json",
  "plan.script.json",
  "plan.skill-composition.json",
  "plan.assets.json",
  "plan.approvals.json",
  "plan.references.json",
  "design.system.json",
  "video.project.json",
  "src/index.ts",
  "src/Root.tsx",
  "src/Video.tsx",
  "src/timelines/VisualTimeline.tsx",
  "src/timelines/AudioTimeline.tsx",
  "src/timelines/CaptionTimeline.tsx",
  "src/visual/manifest.json",
  "src/audio/manifest.json",
  "src/captions/manifest.json"
];
var REQUIRED_ADVISORS = /* @__PURE__ */ new Set([
  "video-motion-direction",
  "video-format-playbooks",
  "video-visual-critique",
  "video-media-import"
]);
var BASE_REVIEW_CHECKS = [
  "narrative",
  "pacing",
  "motionContinuity",
  "shotComposition",
  "typography",
  "color",
  "captions",
  "audio",
  "sourceIntegrity",
  "assetRights",
  "profileFidelity"
];
var sha256 = (value) => createHash2("sha256").update(value).digest("hex");
var finding = (code, filePath, message) => ({ code, path: filePath, message });
var hasFile = (model, filePath) => Object.prototype.hasOwnProperty.call(model.files ?? {}, filePath);
var fileDigest = (model, filePath) => model.digests?.[filePath] ?? sha256(model.files?.[filePath] ?? "");
var isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var sixDigitHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
var stageAtLeast = (stage, expected) => typeof stage === "string" && STAGES.has(stage) && STAGE_RANK[stage] >= STAGE_RANK[expected];
function isGeneratedSubjectPath(filePath) {
  return GENERATED_PATH.test(filePath) || PROOF_MEDIA_PATH.test(filePath) || PROOF_RECORD_PATH.test(filePath);
}
function computeVideoSubjectDigest(model) {
  const records = Object.keys(model.digests ?? model.files ?? {}).filter((filePath) => !isGeneratedSubjectPath(filePath)).sort((left, right) => left.localeCompare(right)).map((filePath) => `${filePath}\0${fileDigest(model, filePath)}
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
    const parsed = JSON.parse(model.files?.[`src/${kind}/manifest.json`] ?? "");
    if (!isObject(parsed) || !Array.isArray(parsed.units)) return [];
    return parsed.units;
  } catch {
    return [];
  }
}
function releaseArtifactPaths(model) {
  const paths = [];
  for (const entry of manifestUnits(model, "visual")) {
    const sourceName = isObject(entry) ? `${entry.source ?? ""}` : "";
    const sourcePath = `src/visual/${sourceName}`;
    const source = model.files?.[sourcePath];
    if (typeof source === "string") paths.push(...Object.values(visualProofPaths(sourcePath, source)));
  }
  for (const entry of manifestUnits(model, "audio")) {
    const sourceName = isObject(entry) ? `${entry.source ?? ""}` : "";
    const sourcePath = `src/audio/${sourceName}`;
    const source = model.files?.[sourcePath];
    if (typeof source === "string") paths.push(...Object.values(audioProofPaths(sourcePath, source)));
  }
  paths.push(
    ...Object.values(finalRenderPaths(model)),
    "evidence.probe.json",
    "evidence.frames.json",
    "evidence.audio.json",
    "evidence.motion.json",
    "evidence.captions.json",
    "evidence.reference.json",
    "evidence/contact-sheet.png",
    "evidence.accessibility.json",
    "review.video.json",
    "release.manifest.json"
  );
  if (hasFile(model, "plan.shots.json")) paths.push("evidence.shots.json");
  paths.push(...Object.keys(model.files ?? {}).filter((filePath) => /^evidence\/admissions\/[^/]+\.json$/u.test(filePath)));
  return [...new Set(paths)];
}
function createVideoReceipt(model) {
  return {
    schemaVersion: 3,
    plugin: PLUGIN,
    artifactId: model.artifactId,
    stage: "release",
    subjectDigest: computeVideoSubjectDigest(model),
    outputs: Object.fromEntries(releaseArtifactPaths(model).map((filePath) => [filePath, fileDigest(model, filePath)]))
  };
}
function validateVideoReceipt(model) {
  try {
    const actual = JSON.parse(model.files?.["receipt.release.json"] ?? "");
    const expected = createVideoReceipt(model);
    if (!isObject(actual)) return false;
    return actual.schemaVersion === expected.schemaVersion && actual.plugin === expected.plugin && actual.artifactId === expected.artifactId && actual.stage === expected.stage && actual.subjectDigest === expected.subjectDigest && JSON.stringify(actual.outputs) === JSON.stringify(expected.outputs);
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
  const text = files?.[filePath];
  if (typeof text !== "string") {
    findings.push(finding("REQUIRED_PATH_MISSING", filePath, `${filePath} is required`));
    return null;
  }
  try {
    return JSON.parse(text);
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
  if (!isObject(plan) || plan.schema !== PLAN_SCHEMA) {
    findings.push(finding("PLAN_SCHEMA_UNSUPPORTED", "plan.contract.json", `plan schema must be ${PLAN_SCHEMA}`));
  } else {
    const budget = isObject(plan.externalBudget) ? plan.externalBudget : {};
    const targetStage = plan.targetStage;
    if (plan.artifactId !== model.artifactId || !PROFILES.has(String(plan.profile)) || !["guided", "autonomous"].includes(String(plan.mode)) || typeof targetStage !== "string" || !STAGES.has(targetStage) || typeof plan.audience !== "string" || !plan.audience.trim() || typeof plan.objective !== "string" || !plan.objective.trim() || typeof plan.platform !== "string" || !plan.platform.trim() || typeof plan.language !== "string" || !plan.language.trim() || typeof budget.currency !== "string" || !budget.currency || typeof budget.limit !== "number" || budget.limit < 0 || typeof budget.spent !== "number" || budget.spent < 0 || budget.spent > budget.limit) {
      findings.push(finding("PLAN_CONTRACT_INVALID", "plan.contract.json", "v2 plan must bind artifact, profile, mode, stage, audience, objective, platform, language, and a bounded external budget"));
    }
    if (Object.hasOwn(plan, "craft")) {
      const craft = isObject(plan.craft) ? plan.craft : {};
      if (!["required", "optional"].includes(String(craft.shotPlanning)) || !["unconfirmed", "free-license", "company-license", "evaluation"].includes(String(craft.remotionLicense)) || plan.profile === "product-promo" && craft.shotPlanning !== "required") findings.push(finding("CRAFT_CONTRACT_INVALID", "plan.contract.json", "craft must declare valid shot planning and Remotion license statuses; product-promo requires shot planning"));
    }
  }
  if (typeof stage !== "string" || !STAGES.has(stage)) findings.push(finding("STAGE_INVALID", "plan.contract.json", `closure stage must be one of ${VIDEO_STAGES.join("|")}`));
}
function planningDigest(model, stage) {
  const paths = stage === "direction" ? ["plan.direction.json"] : stage === "storyboard" ? ["plan.script.json", "plan.storyboard.json", ...hasFile(model, "plan.shots.json") ? ["plan.shots.json"] : []] : ["plan.assets.json"];
  if (paths.length === 1) return fileDigest(model, paths[0] ?? "");
  return sha256(paths.map((filePath) => `${filePath}\0${fileDigest(model, filePath)}
`).join(""));
}
function validateShotPlan(model, stage, findings) {
  if (!stageAtLeast(stage, "storyboard")) return;
  const plan = isObject(model.plan) ? model.plan : {};
  const craft = isObject(plan.craft) ? plan.craft : {};
  const required = craft.shotPlanning === "required";
  if (!hasFile(model, "plan.shots.json")) {
    if (required) findings.push(finding("SHOT_PLAN_MISSING", "plan.shots.json", "required shot planning must cover every storyboard beat"));
    return;
  }
  const shotPlan = parseJson(model.files, "plan.shots.json", findings, "SHOT_PLAN_INVALID");
  if (!isObject(shotPlan) || shotPlan.schema !== SHOT_PLAN_SCHEMA || !Array.isArray(shotPlan.selections) || !Array.isArray(shotPlan.customBeats)) {
    findings.push(finding("SHOT_PLAN_INVALID", "plan.shots.json", `shot plan must use ${SHOT_PLAN_SCHEMA} with selections and customBeats arrays`));
    return;
  }
  if (shotPlan.catalogRevision !== SHOT_LIBRARY_UPSTREAM_COMMIT) findings.push(finding("SHOT_CATALOG_REVISION_INVALID", "plan.shots.json", "shot selections must bind the bundled catalog revision"));
  const storyboard = (() => {
    try {
      return JSON.parse(model.files?.["plan.storyboard.json"] ?? "");
    } catch {
      return null;
    }
  })();
  const beats = isObject(storyboard) && Array.isArray(storyboard.beats) ? storyboard.beats.filter(isObject) : [];
  const beatMap = new Map(beats.map((beat) => [String(beat.id), beat]));
  const covered = /* @__PURE__ */ new Set();
  for (const selection of shotPlan.selections) {
    if (!isObject(selection)) {
      findings.push(finding("SHOT_SELECTION_INVALID", "plan.shots.json", "shot selections must be structured records"));
      continue;
    }
    const beatId = typeof selection.beatId === "string" ? selection.beatId : "";
    const beat = beatMap.get(beatId);
    const reviewFrames = Array.isArray(selection.reviewFrames) ? selection.reviewFrames : [];
    const implementationPath = typeof selection.implementationPath === "string" ? selection.implementationPath : "";
    let catalogValid = true;
    try {
      const selected = getShotRecipe(String(selection.recipeId ?? ""), String(selection.styleId ?? ""));
      if (["direct", "adapted"].includes(String(selection.usage)) && selected.style.status !== "executable") catalogValid = false;
    } catch {
      catalogValid = false;
    }
    const valid = beat !== void 0 && !covered.has(beatId) && ["direct", "adapted", "inspired"].includes(String(selection.usage)) && typeof selection.adaptationNotes === "string" && selection.adaptationNotes.trim().length > 0 && implementationPath === path.normalize(implementationPath) && implementationPath.startsWith("src/visual/") && hasFile(model, implementationPath) && reviewFrames.length >= 2 && reviewFrames.every((frame) => Number.isInteger(frame) && frame >= Number(beat.startFrame) && frame < Number(beat.endFrame)) && new Set(reviewFrames).size === reviewFrames.length && catalogValid;
    if (!valid) findings.push(finding("SHOT_SELECTION_INVALID", "plan.shots.json", `shot selection for ${beatId || "unknown beat"} must bind a real catalog style, implementation path, and review frames`));
    if (beat !== void 0 && !covered.has(beatId)) covered.add(beatId);
  }
  for (const custom of shotPlan.customBeats) {
    if (!isObject(custom) || typeof custom.beatId !== "string" || !beatMap.has(custom.beatId) || covered.has(custom.beatId) || typeof custom.reason !== "string" || !custom.reason.trim()) findings.push(finding("SHOT_CUSTOM_BEAT_INVALID", "plan.shots.json", "custom beats need a unique storyboard beat and a concrete reason"));
    else covered.add(custom.beatId);
  }
  if (required && [...beatMap.keys()].some((beatId) => !covered.has(beatId))) findings.push(finding("SHOT_BEAT_UNCOVERED", "plan.shots.json", "every storyboard beat needs one catalog selection or custom reason"));
}
function validateApproval(model, stage, findings) {
  if (!stageAtLeast(stage, "direction")) return;
  const plan = isObject(model.plan) ? model.plan : {};
  const approvals = parseJson(model.files, "plan.approvals.json", findings, "APPROVALS_INVALID");
  if (!isObject(approvals) || approvals.schema !== APPROVALS_SCHEMA || approvals.mode !== plan.mode || !Array.isArray(approvals.gates)) {
    findings.push(finding("APPROVALS_INVALID", "plan.approvals.json", "approval registry must match the project mode"));
    return;
  }
  for (const gateStage of ["direction", "storyboard", "assets"]) {
    if (!stageAtLeast(stage, gateStage)) continue;
    const gate = approvals.gates.find((entry) => isObject(entry) && entry.stage === gateStage);
    const expectedDigest = planningDigest(model, gateStage);
    const approved = isObject(gate) && gate.status === "approved" && typeof gate.actor === "string" && gate.actor.trim() && gate.subjectSha256 === expectedDigest;
    const waived = plan.mode === "autonomous" && isObject(gate) && gate.status === "waived" && typeof gate.reason === "string" && gate.reason.trim() && gate.subjectSha256 === expectedDigest;
    if (!approved && !waived) findings.push(finding("APPROVAL_REQUIRED", "plan.approvals.json", `${gateStage} requires a current ${plan.mode === "autonomous" ? "approval or reasoned waiver" : "approval"}`));
  }
}
function validateDirection(model, stage, findings) {
  if (!stageAtLeast(stage, "direction")) return;
  const direction = parseJson(model.files, "plan.direction.json", findings, "DIRECTION_INVALID");
  const design = parseJson(model.files, "design.system.json", findings, "DESIGN_SYSTEM_INVALID");
  const composition = parseJson(model.files, "plan.skill-composition.json", findings, "SKILL_COMPOSITION_INVALID");
  if (!isObject(direction) || direction.schema !== DIRECTION_SCHEMA || ["motionThesis", "visualMetaphor", "narrativeArc"].some((key) => typeof direction[key] !== "string" || !String(direction[key]).trim()) || !Array.isArray(direction.motionGrammar) || direction.motionGrammar.length === 0 || !Array.isArray(direction.negativeRules)) {
    findings.push(finding("DIRECTION_INVALID", "plan.direction.json", "direction must define a motion thesis, visual metaphor, narrative arc, motion grammar, and negative rules"));
  }
  const designRecord = isObject(design) ? design : {};
  const colors = isObject(designRecord.colors) ? designRecord.colors : {};
  const typography = isObject(designRecord.typography) ? designRecord.typography : {};
  const motion = isObject(designRecord.motion) ? designRecord.motion : {};
  const captions = isObject(designRecord.captions) ? designRecord.captions : {};
  const audio = isObject(designRecord.audio) ? designRecord.audio : {};
  if (designRecord.schema !== DESIGN_SYSTEM_SCHEMA || ["canvas", "text", "accent"].some((key) => typeof colors[key] !== "string") || ["displayPx", "bodyPx", "captionPx"].some((key) => !Number.isInteger(typography[key]) || Number(typography[key]) <= 0) || !Number.isInteger(designRecord.safeAreaPx) || Number(designRecord.safeAreaPx) < 0 || !Number.isInteger(motion.enterFrames) || !Number.isInteger(motion.exitFrames) || typeof motion.easing !== "string" || typeof captions.maxCharsPerSecond !== "number" || captions.maxCharsPerSecond <= 0 || !Number.isInteger(captions.maxLines) || typeof audio.integratedLufs !== "number" || typeof audio.truePeakDb !== "number") {
    findings.push(finding("DESIGN_SYSTEM_INVALID", "design.system.json", "design system must define semantic color, typography, safe-area, motion, caption, and audio tokens"));
  }
  const workers = isObject(composition) && Array.isArray(composition.workers) ? composition.workers : [];
  const workerMap = new Map(workers.filter(isObject).map((worker) => [String(worker.name), worker]));
  const plan = isObject(model.plan) ? model.plan : {};
  const craft = isObject(plan.craft) ? plan.craft : {};
  const requiredAdvisors = new Set(REQUIRED_ADVISORS);
  if (craft.shotPlanning === "required") requiredAdvisors.add("video-shot-recipes");
  if (!isObject(composition) || composition.schema !== SKILL_COMPOSITION_SCHEMA || workers.length !== requiredAdvisors.size || workers.some((worker) => isObject(worker) && Object.hasOwn(worker, "revision")) || [...requiredAdvisors].some((name) => !["used", "skipped", "unavailable"].includes(String(workerMap.get(name)?.status)) || !["advisor", "external-runner"].includes(String(workerMap.get(name)?.mode)))) {
    findings.push(finding("SKILL_COMPOSITION_INVALID", "plan.skill-composition.json", "every current-source companion must declare its mode and truthful status"));
  }
}
function validateStoryboard(model, stage, findings) {
  if (!stageAtLeast(stage, "storyboard")) return;
  const script = parseJson(model.files, "plan.script.json", findings, "SCRIPT_INVALID");
  const storyboard = parseJson(model.files, "plan.storyboard.json", findings, "STORYBOARD_INVALID");
  const scriptBeats = isObject(script) && Array.isArray(script.beats) ? script.beats : [];
  const claims = isObject(script) && Array.isArray(script.claims) ? script.claims : [];
  if (!isObject(script) || script.schema !== SCRIPT_SCHEMA || scriptBeats.length === 0 || !claims.every((claim) => isObject(claim) && typeof claim.text === "string" && Array.isArray(claim.sources))) findings.push(finding("SCRIPT_INVALID", "plan.script.json", "script must define non-empty beats and source arrays for factual claims"));
  const beats = isObject(storyboard) && Array.isArray(storyboard.beats) ? storyboard.beats : [];
  let cursor = 0;
  const duration = model.project?.durationInFrames;
  const validBeats = isObject(storyboard) && storyboard.schema === STORYBOARD_SCHEMA && beats.length > 0 && beats.every((beat, index) => {
    if (!isObject(beat)) return false;
    const valid = beat.index === index + 1 && typeof beat.id === "string" && beat.id.length > 0 && beat.startFrame === cursor && Number.isInteger(beat.endFrame) && Number(beat.endFrame) > cursor && typeof beat.narrativeJob === "string" && typeof beat.movingObject === "string" && typeof beat.stateChange === "string" && beat.stateChange.trim() && typeof beat.cameraMotion === "string" && typeof beat.textRole === "string" && Array.isArray(beat.assetIds) && typeof beat.pptRisk === "string";
    if (valid) cursor = Number(beat.endFrame);
    return Boolean(valid);
  }) && cursor === duration;
  if (!validBeats) findings.push(finding("STORYBOARD_INVALID", "plan.storyboard.json", "storyboard beats must be contiguous, indexed, motion-directed, and close exactly at the project duration"));
  const plan = isObject(model.plan) ? model.plan : {};
  if (plan.profile === "short-form" && isObject(beats[0]) && Number(beats[0].endFrame) > Number(model.project?.fps) * 3) findings.push(finding("SHORT_FORM_HOOK_LATE", "plan.storyboard.json", "short-form hook must close within the first three seconds"));
  if (plan.profile === "motion-explainer" && beats.length > 0) {
    const meaningful = beats.filter((beat) => isObject(beat) && !/^(?:none|fade|fade-in|slide-in)$/iu.test(String(beat.stateChange))).length;
    if (meaningful / beats.length < 0.8) findings.push(finding("ANTI_PPT_MOTION_INSUFFICIENT", "plan.storyboard.json", "at least 80% of explainer beats need a meaningful visible state change"));
  }
}
function validateAssets(model, stage, findings) {
  if (!stageAtLeast(stage, "assets")) return;
  const manifest = parseJson(model.files, "plan.assets.json", findings, "ASSET_MANIFEST_INVALID");
  const references = parseJson(model.files, "plan.references.json", findings, "REFERENCES_INVALID");
  const assets = isObject(manifest) && Array.isArray(manifest.assets) ? manifest.assets : [];
  const ids = /* @__PURE__ */ new Set();
  for (const asset of assets) {
    if (!isObject(asset) || typeof asset.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(asset.id) || ids.has(asset.id) || !["image", "audio", "video", "subtitle", "font"].includes(String(asset.kind)) || !["user", "licensed", "public-domain", "generated", "external-run"].includes(String(asset.source)) || typeof asset.path !== "string" || !asset.path.startsWith("public/") || asset.path.includes("..") || typeof asset.rights !== "string" || !asset.rights.trim()) findings.push(finding("ASSET_ENTRY_INVALID", "plan.assets.json", "assets need unique ids, allowed kinds/sources, normalized public paths, and declared rights"));
    else {
      ids.add(asset.id);
      if (!hasFile(model, asset.path)) findings.push(finding("ASSET_FILE_MISSING", asset.path, "declared asset file is missing"));
      if (asset.source === "external-run") {
        const evidencePath = `evidence/admissions/${String(asset.runId)}.json`;
        const admission = evidenceObject(model, evidencePath);
        const admittedOutputs = Array.isArray(admission?.outputs) ? admission.outputs : [];
        const boundOutput = admittedOutputs.find((output) => isObject(output) && output.assetId === asset.id && output.path === asset.path);
        if (!asset.path.startsWith("public/admitted/") || typeof asset.runId !== "string" || admission?.schema !== "video-production/admission/v1" || admission?.plugin !== PLUGIN || admission?.artifactId !== model.artifactId || admission?.runId !== asset.runId || !isObject(boundOutput) || boundOutput.digest !== fileDigest(model, asset.path)) findings.push(finding("ASSET_ADMISSION_MISSING", asset.path, "external-run assets require admission evidence bound to the current admitted bytes"));
      }
    }
  }
  if (!isObject(manifest) || manifest.schema !== ASSET_MANIFEST_SCHEMA) findings.push(finding("ASSET_MANIFEST_INVALID", "plan.assets.json", "asset manifest must use the v2 schema"));
  const referenceList = isObject(references) && Array.isArray(references.references) ? references.references : [];
  if (!isObject(references) || references.schema !== REFERENCES_SCHEMA || !referenceList.every((reference) => isObject(reference) && ["inspiration", "structural", "frame-aligned"].includes(String(reference.fidelity)) && (reference.fidelity !== "frame-aligned" || ["owned", "authorized"].includes(String(reference.rights))))) findings.push(finding("REFERENCES_INVALID", "plan.references.json", "references need a fidelity tier; frame-aligned references require owned or authorized rights"));
}
function validateProjectConfig(model, findings) {
  const project = parseJson(model.files, "video.project.json", findings);
  if (!isObject(project)) return;
  if (project.schema !== PROJECT_SCHEMA || project.artifactId !== model.artifactId || !PROFILES.has(String(project.profile))) findings.push(finding("VIDEO_PROJECT_INVALID", "video.project.json", "project must bind the v2 schema, artifact id, and production profile"));
  const plan = isObject(model.plan) ? model.plan : {};
  if (project.profile !== plan.profile) findings.push(finding("VIDEO_PROFILE_MISMATCH", "video.project.json", "project profile must match plan.contract.json"));
  for (const key of ["durationInFrames", "fps", "width", "height"]) {
    const value = project[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) findings.push(finding("VIDEO_PROJECT_INVALID", "video.project.json", `${key} must be a positive integer`));
  }
  if (typeof project.compositionId !== "string" || !project.compositionId.trim()) findings.push(finding("VIDEO_PROJECT_INVALID", "video.project.json", "compositionId must be a non-empty string"));
}
function validateToolchain(files, findings) {
  const pkg = parseJson(files, "package.json", findings);
  const lock = parseJson(files, "package-lock.json", findings);
  const plan = (() => {
    try {
      return JSON.parse(files["plan.contract.json"] ?? "");
    } catch {
      return null;
    }
  })();
  const craft = isObject(plan) && isObject(plan.craft) ? plan.craft : {};
  const requiredDependencies = ["remotion", "@remotion/cli", "react", "react-dom", ...Object.keys(craft).length > 0 ? ["@remotion/motion-blur"] : []];
  if (isObject(pkg)) {
    const listed = isObject(pkg.dependencies) ? pkg.dependencies : {};
    const devListed = isObject(pkg.devDependencies) ? pkg.devDependencies : {};
    const dependencies = { ...listed, ...devListed };
    for (const name of requiredDependencies) if (typeof dependencies[name] !== "string") findings.push(finding("REMOTION_TOOLCHAIN_INVALID", "package.json", `${name} must be pinned by the artifact package`));
    const scripts = isObject(pkg.scripts) ? pkg.scripts : void 0;
    for (const script of ["video:render:visual", "video:render:audio", "video:render:final"]) {
      const value = scripts?.[script];
      if (typeof value !== "string" || !value.trim()) findings.push(finding("RENDER_SCRIPT_MISSING", "package.json", `${script} is required`));
    }
  }
  const packages = isObject(lock) && isObject(lock.packages) ? lock.packages : null;
  if (isObject(lock) && (!Number.isInteger(lock.lockfileVersion) || !packages)) findings.push(finding("PACKAGE_LOCK_INVALID", "package-lock.json", "npm lockfileVersion and packages map are required"));
  else if (isObject(lock) && packages) for (const name of requiredDependencies) {
    const entry = packages[`node_modules/${name}`];
    if (typeof (isObject(entry) ? entry.version : void 0) !== "string") findings.push(finding("PACKAGE_LOCK_DEPENDENCY_MISSING", "package-lock.json", `${name} must be present in the lockfile packages map`));
  }
}
function validateEntrypoints(files, findings) {
  const checks = [
    ["src/index.ts", /registerRoot\s*\(/u, "registerRoot"],
    ["src/Root.tsx", /<\s*Composition\b/u, "Composition"],
    ["src/Video.tsx", /<\s*VisualTimeline\b/u, "VisualTimeline"],
    ["src/Video.tsx", /<\s*AudioTimeline\b/u, "AudioTimeline"],
    ["src/Video.tsx", /<\s*CaptionTimeline\b/u, "CaptionTimeline"],
    ["src/timelines/VisualTimeline.tsx", /visual\/manifest\.json/u, "visual manifest"],
    ["src/timelines/AudioTimeline.tsx", /audio\/manifest\.json/u, "audio manifest"],
    ["src/timelines/CaptionTimeline.tsx", /captions\/manifest\.json/u, "caption manifest"]
  ];
  for (const [filePath, pattern, label] of checks) {
    const text = files[filePath];
    if (typeof text === "string" && !pattern.test(text)) findings.push(finding("REMOTION_ENTRYPOINT_INVALID", filePath, `${filePath} must wire ${label}`));
  }
}
function interval(match, entry, duration, sourcePath, findings) {
  const start = Number(match.groups?.start);
  const end = Number(match.groups?.end);
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
    const specifier = match.groups?.specifier;
    if (specifier === void 0) continue;
    const candidate = path.normalize(path.join(path.dirname(sourcePath), specifier));
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
      const imported = match.groups?.imports ?? "";
      const names = imported.split(",").map((part) => part.trim().split(/\s+as\s+/u)[0]);
      if (names.some((name) => name !== void 0 && forbidden.has(name))) return true;
    }
    if (/import\s+\*\s+as\s+\w+\s+from\s*["']remotion["']/u.test(source)) return true;
  }
  return false;
}
function validRenderProof(model, { proofPath, kind, sourcePath, outputPath, startFrame, endFrame }) {
  let proof;
  try {
    proof = JSON.parse(model.files?.[proofPath] ?? "");
  } catch {
    return false;
  }
  if (!isObject(proof)) return false;
  const media = proof.media;
  const output = isObject(proof.output) ? proof.output : void 0;
  const source = proof.source;
  const writer = isObject(proof.writer) ? proof.writer : void 0;
  const expectedFrames = endFrame - startFrame;
  const outputOk = output?.path === outputPath && output?.sha256 === fileDigest(model, outputPath);
  const sourceOk = sourcePath === null ? source === null : isObject(source) && source.path === sourcePath && source.sha256 === fileDigest(model, sourcePath);
  const mediaRecord = isObject(media) ? media : void 0;
  const format = String(mediaRecord?.format ?? "");
  const videoFacts = mediaRecord?.hasVideo === true && /(?:mp4|mov)/u.test(format) && mediaRecord.width === model.project?.width && mediaRecord.height === model.project?.height;
  const kindFacts = kind === "audio" ? mediaRecord?.hasVideo === false && mediaRecord?.hasAudio === true && /wav/u.test(format) && Number.isInteger(mediaRecord?.sampleRate) && mediaRecord?.sampleRate > 0 && Number.isInteger(mediaRecord?.channels) && mediaRecord?.channels > 0 : videoFacts && (kind === "visual" ? mediaRecord?.hasAudio === false : mediaRecord?.hasAudio === true);
  return proof.schema === RENDER_PROOF_SCHEMA && proof.plugin === PLUGIN && proof.artifactId === model.artifactId && proof.kind === kind && proof.subjectDigest === computeVideoSubjectDigest(model) && sourceOk && outputOk && writer?.capability === "video-render" && writer?.script === `video:render:${kind === "final" ? "final" : kind}` && typeof proof.createdAt === "string" && typeof proof.sessionId === "string" && proof.sessionId !== "unknown" && typeof proof.triggerFrom === "string" && isObject(media) && media.durationInFrames === expectedFrames && media.fps === model.project?.fps && kindFacts;
}
function asUnit(entry) {
  return isObject(entry) ? entry : {};
}
function validateVisual(model, entry, findings, requireProof) {
  const unit = asUnit(entry);
  const match = typeof unit.source === "string" ? unit.source.match(VISUAL_SOURCE) : null;
  const sourcePath = `src/visual/${unit.source ?? "manifest.json"}`;
  if (!match) {
    findings.push(finding("VISUAL_NAME_INVALID", sourcePath, "visual source must encode a six-digit frame interval"));
    return;
  }
  if (Number(match.groups?.index) !== unit.index) findings.push(finding("VISUAL_INDEX_MISMATCH", sourcePath, "visual filename index must match manifest"));
  interval(match, unit, model.project?.durationInFrames, sourcePath, findings);
  const source = model.files?.[sourcePath];
  if (typeof source !== "string") {
    findings.push(finding("VISUAL_SOURCE_MISSING", sourcePath, "visual source is missing"));
    return;
  }
  const { mediaPath, proofPath } = visualProofPaths(sourcePath, source);
  if (requireProof && !hasFile(model, mediaPath)) findings.push(finding("VISUAL_PROOF_MISSING", mediaPath, "current source-hash muted MP4 proof is required"));
  if (requireProof && (!hasFile(model, proofPath) || !validRenderProof(model, { proofPath, kind: "visual", sourcePath, outputPath: mediaPath, startFrame: unit.startFrame, endFrame: unit.endFrame }))) findings.push(finding("VISUAL_RENDER_PROOF_INVALID", proofPath, "visual proof must carry a current structured render receipt"));
  if (ownerViolation(model.files ?? {}, sourcePath)) findings.push(finding("VISUAL_OWNER_VIOLATION", sourcePath, "visual unit closure may not own audio, composition, global scheduling, I/O, network, or wall-clock randomness"));
}
function validateAudio(model, entry, findings, requireProof) {
  const unit = asUnit(entry);
  const match = typeof unit.source === "string" ? unit.source.match(AUDIO_SOURCE) : null;
  const sourcePath = `src/audio/${unit.source ?? "manifest.json"}`;
  if (!match) {
    findings.push(finding("AUDIO_NAME_INVALID", sourcePath, "audio binding must encode role and six-digit frame interval"));
    return;
  }
  if (Number(match.groups?.index) !== unit.index || match.groups?.role !== unit.role) findings.push(finding("AUDIO_MANIFEST_MISMATCH", sourcePath, "audio filename must match index and role"));
  interval(match, unit, model.project?.durationInFrames, sourcePath, findings);
  const binding = parseJson(model.files, sourcePath, findings);
  if (!binding) return;
  const record = isObject(binding) ? binding : {};
  if (record.startFrame !== unit.startFrame || record.endFrame !== unit.endFrame || record.role !== unit.role) findings.push(finding("AUDIO_PROJECTION_MISMATCH", sourcePath, "audio binding and manifest must match"));
  const normalizedAsset = typeof record.asset === "string" ? path.normalize(record.asset) : "";
  if (!normalizedAsset.startsWith("public/") || normalizedAsset.includes("../") || normalizedAsset !== record.asset) findings.push(finding("AUDIO_ASSET_INVALID", sourcePath, "audio asset must be a normalized path below public/"));
  if (!normalizedAsset || !hasFile(model, normalizedAsset)) findings.push(finding("AUDIO_ASSET_MISSING", normalizedAsset || sourcePath, "registered audio asset must exist in the artifact"));
  const sourceText = model.files?.[sourcePath];
  const { mediaPath, proofPath } = audioProofPaths(sourcePath, typeof sourceText === "string" ? sourceText : "");
  if (requireProof && !hasFile(model, mediaPath)) findings.push(finding("AUDIO_PROOF_MISSING", mediaPath, "current source-hash WAV proof is required"));
  if (requireProof && (!hasFile(model, proofPath) || !validRenderProof(model, { proofPath, kind: "audio", sourcePath, outputPath: mediaPath, startFrame: unit.startFrame, endFrame: unit.endFrame }))) findings.push(finding("AUDIO_RENDER_PROOF_INVALID", proofPath, "audio proof must carry a current structured render receipt"));
}
function validateCaption(model, entry, findings) {
  const unit = asUnit(entry);
  const match = typeof unit.source === "string" ? unit.source.match(CAPTION_SOURCE) : null;
  const sourcePath = `src/captions/${unit.source ?? "manifest.json"}`;
  if (!match) {
    findings.push(finding("CAPTION_NAME_INVALID", sourcePath, "caption binding must encode role and a six-digit frame interval"));
    return;
  }
  if (Number(match.groups?.index) !== unit.index || match.groups?.role !== unit.role) findings.push(finding("CAPTION_MANIFEST_MISMATCH", sourcePath, "caption filename must match index and role"));
  interval(match, unit, model.project?.durationInFrames, sourcePath, findings);
  const binding = parseJson(model.files, sourcePath, findings);
  const record = isObject(binding) ? binding : {};
  if (record.startFrame !== unit.startFrame || record.endFrame !== unit.endFrame || record.role !== unit.role || typeof record.text !== "string" || !record.text.trim()) findings.push(finding("CAPTION_PROJECTION_MISMATCH", sourcePath, "caption text, role, and frame interval must match its manifest"));
  const design = (() => {
    try {
      return JSON.parse(model.files?.["design.system.json"] ?? "");
    } catch {
      return null;
    }
  })();
  const captions = isObject(design) && isObject(design.captions) ? design.captions : {};
  const seconds = (Number(unit.endFrame) - Number(unit.startFrame)) / Number(model.project?.fps);
  if (seconds > 0 && typeof record.text === "string" && record.text.length / seconds > Number(captions.maxCharsPerSecond ?? 20)) findings.push(finding("CAPTION_READING_SPEED_EXCEEDED", sourcePath, "caption exceeds the design-system reading-speed limit"));
}
function validateManifest(entries, kind, findings) {
  if (!Array.isArray(entries) || entries.length === 0) {
    findings.push(finding(`${kind.toUpperCase()}_MANIFEST_INVALID`, `src/${kind}/manifest.json`, `${kind} manifest units must be a non-empty array`));
    return;
  }
  const ids = /* @__PURE__ */ new Set();
  const sources = /* @__PURE__ */ new Set();
  entries.forEach((entry, offset) => {
    const unit = asUnit(entry);
    if (unit.index !== offset + 1 || typeof unit.id !== "string" || !unit.id || ids.has(unit.id) || sources.has(unit.source)) findings.push(finding(`${kind.toUpperCase()}_SEQUENCE_INVALID`, `src/${kind}/manifest.json`, `${kind} indexes, ids, and sources must be unique and contiguous`));
    ids.add(unit.id);
    sources.add(unit.source);
  });
}
function evidenceObject(model, filePath) {
  try {
    const value = JSON.parse(model.files?.[filePath] ?? "");
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}
function validEvidenceBase(model, value, schema) {
  const finalPath = finalRenderPaths(model).mediaPath;
  const expectedCapability = [PROBE_SCHEMA, AUDIO_EVIDENCE_SCHEMA, MOTION_EVIDENCE_SCHEMA, CAPTION_EVIDENCE_SCHEMA, REFERENCE_EVIDENCE_SCHEMA, SHOT_EVIDENCE_SCHEMA].includes(schema) ? "video-probe" : "video-review";
  const output = isObject(value?.output) ? value.output : void 0;
  return value?.schema === schema && value?.plugin === PLUGIN && value?.artifactId === model.artifactId && value?.subjectDigest === computeVideoSubjectDigest(model) && output?.path === finalPath && output?.sha256 === fileDigest(model, finalPath) && value?.capability === expectedCapability && typeof value?.createdAt === "string" && typeof value?.sessionId === "string" && value.sessionId !== "unknown" && typeof value?.triggerFrom === "string";
}
function nestedRecord(value, key) {
  const nested = value?.[key];
  return isObject(nested) ? nested : void 0;
}
function validateProbeEvidence(model, findings) {
  const probe = evidenceObject(model, "evidence.probe.json");
  const probeVideo = nestedRecord(probe, "video");
  if (!validEvidenceBase(model, probe, PROBE_SCHEMA) || !probeVideo || probeVideo.durationInFrames !== model.project?.durationInFrames || probeVideo.fps !== model.project?.fps || probeVideo.width !== model.project?.width || probeVideo.height !== model.project?.height || probeVideo.hasVideo !== true || probeVideo.hasAudio !== true || !/(?:mp4|mov)/u.test(String(probeVideo.format ?? ""))) findings.push(finding("PROBE_EVIDENCE_INVALID", "evidence.probe.json", "probe evidence must bind measured final-video facts"));
  const audio = evidenceObject(model, "evidence.audio.json");
  const audioFacts = nestedRecord(audio, "audio");
  const loudness = nestedRecord(audio, "loudness");
  const audioTarget = nestedRecord(audio, "target");
  const measuredLufs = Number(loudness?.integratedLufs);
  const measuredPeak = Number(loudness?.truePeakDb);
  const targetLufs = Number(audioTarget?.integratedLufs);
  const targetPeak = Number(audioTarget?.truePeakDb);
  if (!validEvidenceBase(model, audio, AUDIO_EVIDENCE_SCHEMA) || audioFacts?.present !== true || !Number.isInteger(audioFacts?.sampleRate) || audioFacts?.sampleRate <= 0 || !Number.isInteger(audioFacts?.channels) || audioFacts?.channels <= 0 || audioFacts?.durationInFrames !== model.project?.durationInFrames || !Number.isFinite(measuredLufs) || !Number.isFinite(measuredPeak) || !Number.isFinite(targetLufs) || !Number.isFinite(targetPeak) || Math.abs(measuredLufs - targetLufs) > 2 || measuredPeak > targetPeak + 0.1) findings.push(finding("AUDIO_EVIDENCE_INVALID", "evidence.audio.json", "audio evidence must bind a measured stream within the declared loudness and true-peak targets"));
  const motion = evidenceObject(model, "evidence.motion.json");
  const motionBeats = Array.isArray(motion?.beats) ? motion.beats : [];
  const motionSamples = motionBeats.flatMap((beat) => isObject(beat) && Array.isArray(beat.samples) ? beat.samples : []);
  const validMotionSample = (sample) => {
    if (!isObject(sample) || !Number.isInteger(sample.frame) || !sixDigitHash(sample.sha256) || !isObject(sample.luma)) return false;
    const yAvg = Number(sample.luma.yAvg);
    const yMax = Number(sample.luma.yMax);
    const measured = Number.isFinite(yAvg) && yAvg >= 0 && yAvg <= 255 && Number.isFinite(yMax) && yMax >= 0 && yMax <= 255;
    return measured && sample.blackCandidate === (yAvg <= BLACK_FRAME_THRESHOLD.yAvgMax && yMax <= BLACK_FRAME_THRESHOLD.yMaxMax);
  };
  const threshold = nestedRecord(motion, "blackFrameThreshold");
  const blackCandidates = Array.isArray(motion?.blackCandidates) ? motion.blackCandidates : [];
  const expectedCandidates = /* @__PURE__ */ new Map();
  for (const sample of motionSamples) if (isObject(sample) && sample.blackCandidate === true && Number.isInteger(sample.frame)) expectedCandidates.set(Number(sample.frame), sample);
  const candidateFrames = blackCandidates.map((candidate) => isObject(candidate) ? candidate.frame : void 0);
  const candidatesValid = blackCandidates.length === expectedCandidates.size && new Set(candidateFrames).size === candidateFrames.length && blackCandidates.every((candidate) => {
    if (!isObject(candidate) || !Number.isInteger(candidate.frame) || !sixDigitHash(candidate.sha256) || !isObject(candidate.luma)) return false;
    const expected = expectedCandidates.get(Number(candidate.frame));
    return expected !== void 0 && candidate.sha256 === expected.sha256 && JSON.stringify(candidate.luma) === JSON.stringify(expected.luma);
  });
  if (!validEvidenceBase(model, motion, MOTION_EVIDENCE_SCHEMA) || motion?.verdict !== "pass" || threshold?.yAvgMax !== BLACK_FRAME_THRESHOLD.yAvgMax || threshold?.yMaxMax !== BLACK_FRAME_THRESHOLD.yMaxMax || motionBeats.length === 0 || !motionBeats.every((beat) => isObject(beat) && typeof beat.id === "string" && Array.isArray(beat.samples) && beat.samples.length >= 1 && beat.samples.every(validMotionSample)) || !candidatesValid) findings.push(finding("MOTION_EVIDENCE_INVALID", "evidence.motion.json", "motion evidence must bind decoded samples, normalized luma measurements, and the complete near-black candidate set"));
  const captions = evidenceObject(model, "evidence.captions.json");
  const captionItems = Array.isArray(captions?.items) ? captions.items : [];
  const declaredCaptions = manifestUnits(model, "captions");
  if (!validEvidenceBase(model, captions, CAPTION_EVIDENCE_SCHEMA) || captions?.verdict !== "pass" || captions?.overlap !== false || captions?.count !== declaredCaptions.length || captionItems.length !== declaredCaptions.length || !captionItems.every((item, index) => isObject(item) && isObject(declaredCaptions[index]) && item.id === declaredCaptions[index].id && item.startFrame === declaredCaptions[index].startFrame && item.endFrame === declaredCaptions[index].endFrame && typeof item.charsPerSecond === "number" && Number.isFinite(item.charsPerSecond))) findings.push(finding("CAPTION_EVIDENCE_INVALID", "evidence.captions.json", "caption evidence must bind every declared caption's timing and reading-speed measurement"));
  const references = evidenceObject(model, "evidence.reference.json");
  const comparisons = Array.isArray(references?.comparisons) ? references.comparisons : [];
  const declaredReferences = (() => {
    try {
      const value = JSON.parse(model.files?.["plan.references.json"] ?? "");
      return isObject(value) && Array.isArray(value.references) ? value.references : [];
    } catch {
      return [];
    }
  })();
  if (!validEvidenceBase(model, references, REFERENCE_EVIDENCE_SCHEMA) || references?.verdict !== "pass" || comparisons.length !== declaredReferences.length || !declaredReferences.every((reference) => isObject(reference) && comparisons.some((comparison) => isObject(comparison) && comparison.id === reference.id && comparison.fidelity === reference.fidelity && (reference.fidelity !== "frame-aligned" ? comparison.verdict === "review" : comparison.verdict === "pass" && typeof comparison.ssim === "number" && (typeof comparison.psnr === "number" || comparison.psnr === "infinity"))))) findings.push(finding("REFERENCE_EVIDENCE_INVALID", "evidence.reference.json", "reference evidence must bind every declared fidelity comparison"));
  const shotPlan = evidenceObject(model, "plan.shots.json");
  const declaredShots = Array.isArray(shotPlan?.selections) ? shotPlan.selections.filter(isObject) : [];
  if (declaredShots.length > 0) {
    const shots = evidenceObject(model, "evidence.shots.json");
    const shotSelections = Array.isArray(shots?.selections) ? shots.selections.filter(isObject) : [];
    const validSelections = declaredShots.every((selection) => {
      const evidence = shotSelections.find((entry) => entry.beatId === selection.beatId);
      const reviewFrames = isObject(evidence) && Array.isArray(evidence.reviewFrames) ? evidence.reviewFrames : [];
      const expectedFrames = Array.isArray(selection.reviewFrames) ? selection.reviewFrames : [];
      return isObject(evidence) && evidence.recipeId === selection.recipeId && evidence.styleId === selection.styleId && evidence.usage === selection.usage && evidence.implementationPath === selection.implementationPath && evidence.implementationSha256 === fileDigest(model, String(selection.implementationPath ?? "")) && reviewFrames.length === expectedFrames.length && expectedFrames.every((frame) => reviewFrames.some((sample) => isObject(sample) && sample.frame === frame && sixDigitHash(sample.sha256)));
    });
    if (!validEvidenceBase(model, shots, SHOT_EVIDENCE_SCHEMA) || shots?.catalogRevision !== shotPlan?.catalogRevision || shotSelections.length !== declaredShots.length || !validSelections) findings.push(finding("SHOT_EVIDENCE_INVALID", "evidence.shots.json", "shot evidence must bind every selected recipe to current implementation bytes and decoded review frames"));
  }
  const sheetDigest = motion?.contactSheetSha256;
  if (!hasFile(model, "evidence/contact-sheet.png") || !sixDigitHash(sheetDigest) || sheetDigest !== fileDigest(model, "evidence/contact-sheet.png")) findings.push(finding("CONTACT_SHEET_INVALID", "evidence/contact-sheet.png", "contact sheet bytes must match motion evidence"));
}
function requiredReviewChecks(model) {
  const plan = isObject(model.plan) ? model.plan : {};
  const shotPlan = evidenceObject(model, "plan.shots.json");
  const hasShotSelections = Array.isArray(shotPlan?.selections) && shotPlan.selections.length > 0;
  return [
    ...BASE_REVIEW_CHECKS,
    ...hasShotSelections ? ["shotFidelity"] : [],
    ...plan.profile === "reference-led" ? ["referenceFidelity"] : [],
    ...plan.profile === "micro-drama" ? ["characterContinuity"] : []
  ];
}
function validateReviewEvidence(model, findings) {
  const { proofPath } = finalRenderPaths(model);
  const frames = evidenceObject(model, "evidence.frames.json");
  const frameList = Array.isArray(frames?.frames) ? frames.frames : [];
  const frameIndexes = frameList.map((item) => isObject(item) ? item.frame : void 0);
  const framesTool = nestedRecord(frames, "tool");
  const duration = model.project?.durationInFrames;
  const shotPlan = evidenceObject(model, "plan.shots.json");
  const requiredShotFrames = Array.isArray(shotPlan?.selections) ? shotPlan.selections.flatMap((selection) => isObject(selection) && Array.isArray(selection.reviewFrames) ? selection.reviewFrames : []) : [];
  const motion = evidenceObject(model, "evidence.motion.json");
  const blackCandidateFrames = Array.isArray(motion?.blackCandidates) ? motion.blackCandidates.map((candidate) => isObject(candidate) ? candidate.frame : void 0).filter((frame) => Number.isInteger(frame)) : [];
  if (!validEvidenceBase(model, frames, FRAME_EVIDENCE_SCHEMA) || framesTool?.name !== "ffmpeg" || typeof framesTool?.version !== "string" || !framesTool.version || frameList.length < 3 || !frameList.every((item) => {
    const record = isObject(item) ? item : void 0;
    return Number.isInteger(record?.frame) && record?.frame >= 0 && record?.frame < duration && sixDigitHash(record?.sha256);
  }) || new Set(frameIndexes).size !== frameIndexes.length || !frameIndexes.includes(0) || !frameIndexes.includes(duration - 1) || !requiredShotFrames.every((frame) => frameIndexes.includes(frame)) || !blackCandidateFrames.every((frame) => frameIndexes.includes(frame))) findings.push(finding("FRAME_EVIDENCE_INVALID", "evidence.frames.json", "frame evidence must bind unique start, interior, final, selected shot-review, and near-black candidate frame hashes"));
  const accessibility = evidenceObject(model, "evidence.accessibility.json");
  const accessibilityChecks = nestedRecord(accessibility, "checks");
  if (!validEvidenceBase(model, accessibility, ACCESSIBILITY_EVIDENCE_SCHEMA) || accessibility?.verdict !== "pass" || !sixDigitHash(accessibility?.reviewInputSha256) || !["captionsReviewed", "flashingReviewed", "contrastReviewed"].every((key) => accessibilityChecks?.[key] === true)) findings.push(finding("ACCESSIBILITY_EVIDENCE_INVALID", "evidence.accessibility.json", "accessibility evidence requires explicit passing checks"));
  const review = evidenceObject(model, "review.video.json");
  const finalProof = evidenceObject(model, proofPath);
  const reviewer = nestedRecord(review, "reviewer");
  const checks = nestedRecord(review, "checks");
  const reviewerKind = reviewer?.kind;
  const expectedShotDigest = hasFile(model, "evidence.shots.json") ? fileDigest(model, "evidence.shots.json") : void 0;
  const blackFrameAssessments = Array.isArray(review?.blackFrameAssessments) ? review.blackFrameAssessments : [];
  const assessedFrames = blackFrameAssessments.map((assessment) => isObject(assessment) ? assessment.frame : void 0);
  const blackFramesReviewed = blackFrameAssessments.length === blackCandidateFrames.length && new Set(assessedFrames).size === assessedFrames.length && blackFrameAssessments.every((assessment) => isObject(assessment) && Number.isInteger(assessment.frame) && blackCandidateFrames.includes(assessment.frame) && assessment.classification === "expected" && typeof assessment.notes === "string" && assessment.notes.trim().length > 0);
  if (!validEvidenceBase(model, review, VIDEO_REVIEW_SCHEMA) || review?.verdict !== "pass" || !sixDigitHash(review?.reviewInputSha256) || review?.reviewInputSha256 !== accessibility?.reviewInputSha256 || (typeof reviewerKind !== "string" || !["human", "independent-agent"].includes(reviewerKind)) || typeof reviewer?.id !== "string" || typeof reviewer?.sessionId !== "string" || reviewer?.sessionId !== review?.sessionId || reviewer?.sessionId === finalProof?.sessionId || !requiredReviewChecks(model).every((key) => checks?.[key] === "pass") || !blackFramesReviewed || review?.frameEvidenceSha256 !== fileDigest(model, "evidence.frames.json") || review?.accessibilityEvidenceSha256 !== fileDigest(model, "evidence.accessibility.json") || review?.motionEvidenceSha256 !== fileDigest(model, "evidence.motion.json") || expectedShotDigest !== void 0 && review?.shotEvidenceSha256 !== expectedShotDigest) findings.push(finding("VIDEO_REVIEW_INVALID", "review.video.json", "video review must be independent, profile-complete, passing, and bound to frame, accessibility, motion, near-black, and selected-shot evidence"));
}
function validateReleaseEvidence(model, findings) {
  const { mediaPath, proofPath } = finalRenderPaths(model);
  if (!hasFile(model, proofPath) || !validRenderProof(model, { proofPath, kind: "final", sourcePath: null, outputPath: mediaPath, startFrame: 0, endFrame: model.project?.durationInFrames })) findings.push(finding("FINAL_RENDER_PROOF_INVALID", proofPath, "final MP4 requires a current structured render proof"));
  validateProbeEvidence(model, findings);
  validateReviewEvidence(model, findings);
  const plan = isObject(model.plan) ? model.plan : {};
  const craft = isObject(plan.craft) ? plan.craft : {};
  if (Object.keys(craft).length > 0 && !["free-license", "company-license", "evaluation"].includes(String(craft.remotionLicense))) findings.push(finding("REMOTION_LICENSE_UNCONFIRMED", "plan.contract.json", "release requires an explicit Remotion license status declaration"));
  const manifest = evidenceObject(model, "release.manifest.json");
  const expectedManifest = createVideoReleaseManifest(model);
  if (JSON.stringify(manifest) !== JSON.stringify(expectedManifest)) findings.push(finding("RELEASE_MANIFEST_INVALID", "release.manifest.json", "release manifest must bind the current subject and every delivery output"));
}
function validateVideoModel(model, { stage } = {}) {
  const findings = [];
  const files = model.files ?? {};
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(model.artifactId ?? "")) findings.push(finding("ARTIFACT_DIRECTORY_INVALID", ".", "video artifact directory must use a kebab-case id"));
  if (hasFile(model, ".video-delivery-journal.json")) findings.push(finding("MUTATION_JOURNAL_OPEN", ".video-delivery-journal.json", "an interrupted generated writer must be resumed or rolled back"));
  validateRequired(files, findings);
  validateArtifactGitignore(files, findings);
  validatePlan(model, stage, findings);
  validateApproval(model, stage, findings);
  validateProjectConfig(model, findings);
  validateToolchain(files, findings);
  validateEntrypoints(files, findings);
  validateDirection(model, stage, findings);
  validateStoryboard(model, stage, findings);
  validateShotPlan(model, stage, findings);
  validateAssets(model, stage, findings);
  if (stageAtLeast(stage, "composition")) {
    const visualManifest = parseJson(files, "src/visual/manifest.json", findings);
    const audioManifest = parseJson(files, "src/audio/manifest.json", findings);
    const captionManifest = parseJson(files, "src/captions/manifest.json", findings);
    const visual = isObject(visualManifest) && Array.isArray(visualManifest.units) ? visualManifest.units : [];
    const audio = isObject(audioManifest) && Array.isArray(audioManifest.units) ? audioManifest.units : [];
    const captions = isObject(captionManifest) && Array.isArray(captionManifest.units) ? captionManifest.units : [];
    validateManifest(visual, "visual", findings);
    validateManifest(audio, "audio", findings);
    if (!isObject(captionManifest) || !Array.isArray(captionManifest.units)) findings.push(finding("CAPTION_MANIFEST_INVALID", "src/captions/manifest.json", "caption manifest units must be an array"));
    const profile = isObject(model.plan) ? model.plan.profile : void 0;
    if (["short-form", "talking-head"].includes(String(profile)) && captions.length === 0) findings.push(finding("CAPTION_MANIFEST_EMPTY", "src/captions/manifest.json", `${profile} requires timed captions`));
    visual.forEach((entry) => validateVisual(model, entry, findings, stageAtLeast(stage, "render")));
    audio.forEach((entry) => validateAudio(model, entry, findings, stageAtLeast(stage, "render")));
    captions.forEach((entry) => validateCaption(model, entry, findings));
    if (stageAtLeast(stage, "render")) {
      const { mediaPath, proofPath } = finalRenderPaths(model);
      if (!hasFile(model, proofPath) || !validRenderProof(model, { proofPath, kind: "final", sourcePath: null, outputPath: mediaPath, startFrame: 0, endFrame: model.project?.durationInFrames })) findings.push(finding("FINAL_RENDER_PROOF_INVALID", proofPath, "final MP4 requires a current structured render proof"));
    }
  }
  if (stage === "probe") validateProbeEvidence(model, findings);
  if (stage === "review") {
    validateProbeEvidence(model, findings);
    validateReviewEvidence(model, findings);
  }
  if (stage === "release") {
    for (const filePath of [...releaseArtifactPaths(model), "receipt.release.json"]) if (!hasFile(model, filePath)) findings.push(finding("RELEASE_PATH_MISSING", filePath, `${filePath} is required for release`));
    validateReleaseEvidence(model, findings);
    if (hasFile(model, "receipt.release.json") && !validateVideoReceipt(model)) findings.push(finding("RECEIPT_INVALID", "receipt.release.json", "release receipt must bind current video sources and outputs"));
  }
  return findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));
}
var WRITER_PATHS = {
  "video-admit": /^(?:public\/admitted\/[^/]+|evidence\/admissions\/[^/]+\.json|\.video-delivery-journal\.json)$/u,
  "video-render": /^(?:src\/visual\/.*\.mp4(?:\.proof\.json)?|src\/audio\/.*\.wav(?:\.proof\.json)?|dist\/[^/]+\.mp4(?:\.proof\.json)?)$/u,
  "video-probe": /^(?:evidence\.(?:probe|audio|motion|captions|reference|shots)\.json|evidence\/contact-sheet\.png|\.video-delivery-journal\.json)$/u,
  "video-review": /^(?:evidence\.(?:frames|accessibility)\.json|review\.video\.json)$/u,
  "video-release": /^(?:release\.manifest\.json|receipt\.release\.json|\.video-delivery-journal\.json)$/u,
  "video-shot-stage": /^(?:plan\.(?:shots|approvals)\.json|references\/shot-recipes\/[^/]+\/.*|\.video-delivery-journal\.json)$/u
};
function evaluateVideoWrite({ relativePath = "", toolName = "", writer = "" } = {}) {
  const normalized = String(relativePath).replaceAll("\\", "/");
  const match = normalized.match(/(?:^|\/)artifacts\/video\/[^/]+\/(?<inside>.+)$/u);
  if (!match) return { decision: "allow" };
  const inside = match.groups?.inside;
  if (inside === void 0) return { decision: "allow" };
  const protectedPath = GENERATED_PATH.test(inside) || ADMITTED_ASSET_PATH.test(inside) || PROOF_MEDIA_PATH.test(inside) || PROOF_RECORD_PATH.test(inside) || CAPABILITY_PATH.test(inside);
  if (!protectedPath) return { decision: "allow" };
  const writerPattern = WRITER_PATHS[writer];
  if (writerPattern?.test(inside)) return { decision: "allow", capability: writer };
  return { decision: "deny", code: "PROTECTED_WRITER_REQUIRED", message: `${inside} requires its exact video writer capability, not ${toolName || "an unregistered tool"}` };
}

export {
  issueWriterCapability,
  consumeWriterCapability,
  processWriterArgv,
  PROBE_SCHEMA,
  AUDIO_EVIDENCE_SCHEMA,
  MOTION_EVIDENCE_SCHEMA,
  CAPTION_EVIDENCE_SCHEMA,
  REFERENCE_EVIDENCE_SCHEMA,
  SHOT_EVIDENCE_SCHEMA,
  FRAME_EVIDENCE_SCHEMA,
  ACCESSIBILITY_EVIDENCE_SCHEMA,
  VIDEO_REVIEW_SCHEMA,
  REVIEW_INPUT_SCHEMA,
  PLAN_SCHEMA,
  SHOT_PLAN_SCHEMA,
  DIRECTION_SCHEMA,
  SCRIPT_SCHEMA,
  STORYBOARD_SCHEMA,
  SKILL_COMPOSITION_SCHEMA,
  ASSET_MANIFEST_SCHEMA,
  APPROVALS_SCHEMA,
  REFERENCES_SCHEMA,
  DESIGN_SYSTEM_SCHEMA,
  PROJECT_SCHEMA,
  BLACK_FRAME_THRESHOLD,
  VIDEO_PROFILES,
  computeVideoSubjectDigest,
  visualProofPaths,
  audioProofPaths,
  finalRenderPaths,
  createVideoReceipt,
  validateVideoReceipt,
  createVideoRenderProof,
  createVideoReleaseManifest,
  validateVideoModel,
  evaluateVideoWrite
};
