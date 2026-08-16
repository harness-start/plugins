import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  APPROVALS_SCHEMA,
  DESIGN_SYSTEM_SCHEMA,
  DIRECTION_SCHEMA,
  PLAN_SCHEMA,
  SCRIPT_SCHEMA,
  SKILL_COMPOSITION_SCHEMA,
  STORYBOARD_SCHEMA,
  audioProofPaths,
  createVideoRenderProof,
  createVideoReceipt,
  evaluateVideoWrite,
  finalRenderPaths,
  visualProofPaths,
  validateVideoModel,
  validateVideoReceipt,
} from "../src/lib/contract.js";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function validModel() {
  const visual = "export function Intro() { const frame = useCurrentFrame(); return <div>{frame}</div>; }\n";
  const audio = JSON.stringify({ asset: "public/audio/bed.wav", trackId: "music", role: "music", startFrame: 0, endFrame: 240 });
  const direction = JSON.stringify({ schema: DIRECTION_SCHEMA, motionThesis: "A signal branches from one node into an operating network.", visualMetaphor: "branching signal network", narrativeArc: "isolated input to coordinated outcome", motionGrammar: ["branch", "route", "resolve"], negativeRules: ["slide-deck pacing"] });
  const script = JSON.stringify({ schema: SCRIPT_SCHEMA, beats: [{ id: "explain", narration: "One signal becomes a coordinated network." }], claims: [] });
  const storyboard = JSON.stringify({ schema: STORYBOARD_SCHEMA, beats: [{ index: 1, id: "explain", startFrame: 0, endFrame: 240, narrativeJob: "mechanism", movingObject: "signal", stateChange: "branches into a network", cameraMotion: "slow push", textRole: "label", assetIds: ["music-bed"], pptRisk: "static diagram" }] });
  const assets = JSON.stringify({ schema: "video-production/assets/v2", assets: [{ id: "music-bed", kind: "audio", source: "user", path: "public/audio/bed.wav", rights: "owned" }] });
  const workers = [
    ["motion-art-direction", "advisor"], ["animation-principles", "advisor"], ["beat-sync-editing", "advisor"], ["color-motion", "advisor"], ["shot-composition", "advisor"], ["explainer-video", "advisor"], ["short-form-video", "advisor"], ["caption-animation", "advisor"], ["product-launch-video", "advisor"], ["gemini-tts", "external-runner"], ["chengfeng-cut", "external-runner"], ["chengfeng-subtitle", "external-runner"], ["model-selector", "advisor"], ["prompt-translator", "advisor"], ["seedance-storyboard", "advisor"], ["impeccable", "advisor"],
  ].map(([name, mode]) => ({ name, mode, status: "skipped" }));
  const storyboardDigest = sha256(`plan.script.json\0${sha256(script)}\nplan.storyboard.json\0${sha256(storyboard)}\n`);
  const visualDigest = sha256(visual);
  const audioDigest = sha256(audio);
  const model = {
    artifactId: "launch-video",
    files: {
      ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
      "package.json": JSON.stringify({ scripts: { "video:render:visual": "render-visual", "video:render:audio": "render-audio", "video:render:final": "render-final" }, dependencies: { remotion: "1.0.0", "@remotion/cli": "1.0.0", react: "1.0.0", "react-dom": "1.0.0" } }),
      "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/remotion": { version: "1.0.0" }, "node_modules/@remotion/cli": { version: "1.0.0" }, "node_modules/react": { version: "1.0.0" }, "node_modules/react-dom": { version: "1.0.0" } } }),
      "plan.contract.json": JSON.stringify({ schema: PLAN_SCHEMA, artifactId: "launch-video", profile: "motion-explainer", mode: "guided", targetStage: "render", audience: "operators", objective: "explain coordinated work", platform: "web", language: "en", assumptions: [], externalBudget: { currency: "USD", limit: 0, spent: 0 } }),
      "plan.direction.json": direction,
      "plan.script.json": script,
      "plan.storyboard.json": storyboard,
      "plan.skill-composition.json": JSON.stringify({ schema: SKILL_COMPOSITION_SCHEMA, workers }),
      "plan.assets.json": assets,
      "plan.approvals.json": JSON.stringify({ schema: APPROVALS_SCHEMA, mode: "guided", gates: [{ stage: "direction", status: "approved", subjectSha256: sha256(direction), actor: "user", reason: "" }, { stage: "storyboard", status: "approved", subjectSha256: storyboardDigest, actor: "user", reason: "" }, { stage: "assets", status: "approved", subjectSha256: sha256(assets), actor: "user", reason: "" }] }),
      "plan.references.json": JSON.stringify({ schema: "video-production/references/v1", references: [] }),
      "design.system.json": JSON.stringify({ schema: DESIGN_SYSTEM_SCHEMA, colors: { canvas: "#111111", text: "#ffffff", accent: "#5eead4" }, typography: { displayPx: 96, bodyPx: 42, captionPx: 36 }, safeAreaPx: 80, motion: { enterFrames: 15, exitFrames: 12, easing: "ease-out" }, captions: { maxCharsPerSecond: 20, maxLines: 2 }, audio: { integratedLufs: -16, truePeakDb: -1 } }),
      "video.project.json": JSON.stringify({ schema: "video-production/project/v2", artifactId: "launch-video", profile: "motion-explainer", durationInFrames: 240, fps: 30, width: 1920, height: 1080, compositionId: "Main" }),
      "src/index.ts": "registerRoot(Root);\n",
      "src/Root.tsx": "export const Root = () => <Composition id='main' />;\n",
      "src/Video.tsx": "export const Video = () => <><VisualTimeline/><AudioTimeline/><CaptionTimeline/></>;\n",
      "src/timelines/VisualTimeline.tsx": "import manifest from '../visual/manifest.json'; export const VisualTimeline = () => manifest.units.length;\n",
      "src/timelines/AudioTimeline.tsx": "import manifest from '../audio/manifest.json'; export const AudioTimeline = () => manifest.units.length;\n",
      "src/timelines/CaptionTimeline.tsx": "import manifest from '../captions/manifest.json'; export const CaptionTimeline = () => manifest.units.length;\n",
      "src/visual/manifest.json": JSON.stringify({ units: [{ index: 1, id: "intro", startFrame: 0, endFrame: 90, source: "v001-intro.f000000-f000090.tsx" }] }),
      "src/visual/v001-intro.f000000-f000090.tsx": visual,
      [`src/visual/v001-intro.f000000-f000090.${visualDigest}.mp4`]: "MP4",
      "src/audio/manifest.json": JSON.stringify({ units: [{ index: 1, id: "music-bed", role: "music", startFrame: 0, endFrame: 240, source: "a001-music-bed.f000000-f000240.audio.json" }] }),
      "src/audio/a001-music-bed.f000000-f000240.audio.json": audio,
      [`src/audio/a001-music-bed.f000000-f000240.${audioDigest}.wav`]: "WAV",
      "public/audio/bed.wav": "ASSET",
      "src/captions/manifest.json": JSON.stringify({ units: [] }),
    },
    plan: { schema: PLAN_SCHEMA, artifactId: "launch-video", profile: "motion-explainer", mode: "guided", targetStage: "render", audience: "operators", objective: "explain coordinated work", platform: "web", language: "en", assumptions: [], externalBudget: { currency: "USD", limit: 0, spent: 0 } },
    project: { schema: "video-production/project/v2", artifactId: "launch-video", profile: "motion-explainer", durationInFrames: 240, fps: 30, width: 1920, height: 1080, compositionId: "Main" },
  };
  const visualPaths = visualProofPaths("src/visual/v001-intro.f000000-f000090.tsx", visual);
  model.files[visualPaths.proofPath] = JSON.stringify({ ...createVideoRenderProof(model, {
    kind: "visual",
    sourcePath: "src/visual/v001-intro.f000000-f000090.tsx",
    outputPath: visualPaths.mediaPath,
    media: { format: "mov,mp4", durationInFrames: 90, fps: 30, hasVideo: true, hasAudio: false, width: 1920, height: 1080 },
    script: "video:render:visual",
  }), createdAt: "2026-01-01T00:00:00.000Z", sessionId: "render-session", triggerFrom: "test" });
  const audioPaths = audioProofPaths("src/audio/a001-music-bed.f000000-f000240.audio.json", audio);
  model.files[audioPaths.proofPath] = JSON.stringify({ ...createVideoRenderProof(model, {
    kind: "audio",
    sourcePath: "src/audio/a001-music-bed.f000000-f000240.audio.json",
    outputPath: audioPaths.mediaPath,
    media: { format: "wav", durationInFrames: 240, fps: 30, hasVideo: false, hasAudio: true, sampleRate: 48000, channels: 2 },
    script: "video:render:audio",
  }), createdAt: "2026-01-01T00:00:00.000Z", sessionId: "render-session", triggerFrom: "test" });
  const finalPaths = finalRenderPaths(model);
  model.files[finalPaths.mediaPath] = "MP4-FINAL";
  model.files[finalPaths.proofPath] = JSON.stringify({ ...createVideoRenderProof(model, { kind: "final", outputPath: finalPaths.mediaPath, media: { format: "mov,mp4", durationInFrames: 240, fps: 30, hasVideo: true, hasAudio: true, width: 1920, height: 1080 }, script: "video:render:final" }), createdAt: "2026-01-01T00:00:00.000Z", sessionId: "render-session", triggerFrom: "test" });
  return model;
}

function v2PlanningModel() {
  const model = validModel();
  const direction = JSON.stringify({
    schema: DIRECTION_SCHEMA,
    motionThesis: "A signal branches from one node into an operating network.",
    visualMetaphor: "branching signal network",
    narrativeArc: "isolated input to coordinated outcome",
    motionGrammar: ["branch", "route", "resolve"],
    negativeRules: ["slide-deck pacing"],
  });
  model.project = { ...model.project, profile: "motion-explainer" };
  Object.assign(model.files, {
    "plan.contract.json": JSON.stringify({ schema: PLAN_SCHEMA, artifactId: "launch-video", profile: "motion-explainer", mode: "guided", targetStage: "direction", audience: "operators", objective: "explain coordinated work", platform: "web", language: "en", assumptions: [], externalBudget: { currency: "USD", limit: 0, spent: 0 } }),
    "plan.direction.json": direction,
    "plan.script.json": JSON.stringify({ schema: SCRIPT_SCHEMA, beats: [], claims: [] }),
    "plan.storyboard.json": JSON.stringify({ schema: STORYBOARD_SCHEMA, beats: [] }),
    "plan.skill-composition.json": JSON.stringify({ schema: SKILL_COMPOSITION_SCHEMA, workers: [] }),
    "plan.assets.json": JSON.stringify({ schema: "video-production/assets/v2", assets: [] }),
    "plan.approvals.json": JSON.stringify({ schema: APPROVALS_SCHEMA, mode: "guided", gates: [{ stage: "direction", status: "pending", subjectSha256: sha256(direction), actor: "", reason: "" }] }),
    "plan.references.json": JSON.stringify({ schema: "video-production/references/v1", references: [] }),
    "design.system.json": JSON.stringify({ schema: DESIGN_SYSTEM_SCHEMA, colors: { canvas: "#111111", text: "#ffffff", accent: "#5eead4" }, typography: { displayPx: 96, bodyPx: 42, captionPx: 36 }, safeAreaPx: 80, motion: { enterFrames: 15, exitFrames: 12, easing: "ease-out" }, captions: { maxCharsPerSecond: 20, maxLines: 2 }, audio: { integratedLufs: -16, truePeakDb: -1 } }),
    "video.project.json": JSON.stringify(model.project),
    "src/timelines/CaptionTimeline.tsx": "import manifest from '../captions/manifest.json'; export const CaptionTimeline = () => manifest.units.length;\n",
    "src/captions/manifest.json": JSON.stringify({ units: [] }),
  });
  model.plan = JSON.parse(model.files["plan.contract.json"]);
  model.files["src/Video.tsx"] = "export const Video = () => <><VisualTimeline/><AudioTimeline/><CaptionTimeline/></>;\n";
  return model;
}

test("v2 contract rejects a legacy unversioned plan instead of silently accepting it", () => {
  const model = validModel();
  model.plan = { artifactId: "launch-video", targetStage: "source" };
  model.files["plan.contract.json"] = JSON.stringify(model.plan);

  const codes = validateVideoModel(model, { stage: "source" }).map(({ code }) => code);

  assert.ok(codes.includes("PLAN_SCHEMA_UNSUPPORTED"));
});

test("guided direction stage requires an approved record bound to the current direction digest", () => {
  const model = v2PlanningModel();

  const pendingCodes = validateVideoModel(model, { stage: "direction" }).map(({ code }) => code);
  assert.ok(pendingCodes.includes("APPROVAL_REQUIRED"));

  const approvals = JSON.parse(model.files["plan.approvals.json"]);
  approvals.gates[0] = { ...approvals.gates[0], status: "approved", actor: "user" };
  model.files["plan.approvals.json"] = JSON.stringify(approvals);
  const approvedCodes = validateVideoModel(model, { stage: "direction" }).map(({ code }) => code);
  assert.equal(approvedCodes.includes("APPROVAL_REQUIRED"), false);
});

test("accepts matching visual and audio frame projections with source-hash proofs", () => {
  assert.deepEqual(validateVideoModel(validModel(), { stage: "render" }), []);
});

test("reports a visual owner violation and stale visual proof", () => {
  const model = validModel();
  model.files["src/visual/v001-intro.f000000-f000090.tsx"] = "export function Intro() { return <Audio src='x' />; }\n";

  const codes = validateVideoModel(model, { stage: "render" }).map(({ code }) => code);

  assert.ok(codes.includes("VISUAL_OWNER_VIOLATION"));
  assert.ok(codes.includes("VISUAL_PROOF_MISSING"));
});

test("reports an interval that exceeds the composition duration", () => {
  const model = validModel();
  model.files["src/visual/manifest.json"] = JSON.stringify({ units: [{ index: 1, id: "intro", startFrame: 0, endFrame: 300, source: "v001-intro.f000000-f000300.tsx" }] });

  const codes = validateVideoModel(model, { stage: "composition" }).map(({ code }) => code);

  assert.ok(codes.includes("FRAME_INTERVAL_INVALID"));
});

test("rejects unknown stages instead of silently degrading to source", () => {
  const codes = validateVideoModel(validModel(), { stage: "releaze" }).map(({ code }) => code);

  assert.ok(codes.includes("STAGE_INVALID"));
});

test("rejects a non-kebab artifact directory instead of skipping it", () => {
  const model = validModel();
  model.artifactId = "Launch Video";
  model.project = { ...model.project, artifactId: "Launch Video" };
  model.files["video.project.json"] = JSON.stringify(model.project);
  model.files["plan.contract.json"] = JSON.stringify({ artifactId: "Launch Video", targetStage: "source" });

  const codes = validateVideoModel(model, { stage: "composition" }).map(({ code }) => code);

  assert.ok(codes.includes("ARTIFACT_DIRECTORY_INVALID"));
});

test("requires non-empty visual and audio manifest arrays", () => {
  const model = validModel();
  model.files["src/visual/manifest.json"] = JSON.stringify({ units: [] });
  model.files["src/audio/manifest.json"] = JSON.stringify({ units: [] });

  const codes = validateVideoModel(model, { stage: "composition" }).map(({ code }) => code);

  assert.ok(codes.includes("VISUAL_MANIFEST_INVALID"));
  assert.ok(codes.includes("AUDIO_MANIFEST_INVALID"));
});

test("requires every declared Remotion dependency to exist in package-lock", () => {
  const model = validModel();
  model.files["package-lock.json"] = JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/react": { version: "1.0.0" } } });

  const codes = validateVideoModel(model, { stage: "composition" }).map(({ code }) => code);

  assert.ok(codes.includes("PACKAGE_LOCK_DEPENDENCY_MISSING"));
});

test("rejects escaped or missing public audio assets", () => {
  const model = validModel();
  const sourcePath = "src/audio/a001-music-bed.f000000-f000240.audio.json";
  const escaped = JSON.stringify({ asset: "public/../../outside.wav", trackId: "music", role: "music", startFrame: 0, endFrame: 240 });
  model.files[sourcePath] = escaped;
  model.files[`src/audio/a001-music-bed.f000000-f000240.${sha256(escaped)}.wav`] = "WAV";

  const codes = validateVideoModel(model, { stage: "composition" }).map(({ code }) => code);

  assert.ok(codes.includes("AUDIO_ASSET_INVALID"));
  assert.ok(codes.includes("AUDIO_ASSET_MISSING"));
});

test("rejects visual owner aliases that hide Audio ownership", () => {
  const model = validModel();
  const sourcePath = "src/visual/v001-intro.f000000-f000090.tsx";
  const source = "import { Audio as Sound } from 'remotion'; export function Intro() { return <Sound src='x' />; }\n";
  model.files[sourcePath] = source;
  model.files[`src/visual/v001-intro.f000000-f000090.${sha256(source)}.mp4`] = "MP4";

  const codes = validateVideoModel(model, { stage: "composition" }).map(({ code }) => code);

  assert.ok(codes.includes("VISUAL_OWNER_VIOLATION"));
});

test("denies direct video proof and dist writes but allows visual source", () => {
  assert.equal(evaluateVideoWrite({ relativePath: "artifacts/video/launch/dist/launch.mp4", toolName: "Write" }).decision, "deny");
  assert.equal(evaluateVideoWrite({ relativePath: "artifacts/video/launch/src/audio/a001-bed.f000000-f000010.abc.wav", toolName: "Write" }).decision, "deny");
  assert.deepEqual(evaluateVideoWrite({ relativePath: "artifacts/video/launch/src/visual/v001-intro.f000000-f000090.tsx", toolName: "apply_patch" }), { decision: "allow" });
  assert.equal(evaluateVideoWrite({ relativePath: "artifacts/video/launch/public/admitted/voice.wav", toolName: "Write" }).decision, "deny");
  assert.equal(evaluateVideoWrite({ relativePath: "artifacts/video/launch/evidence/admissions/run-1.json", toolName: "Write" }).decision, "deny");
});

test("writer capabilities are output-specific and exact", () => {
  const finalPath = "artifacts/video/launch-video/dist/launch-video.mp4";
  assert.equal(evaluateVideoWrite({ relativePath: finalPath, writer: "video-render" }).decision, "allow");
  assert.equal(evaluateVideoWrite({ relativePath: finalPath, writer: "video-release" }).decision, "deny");
  assert.equal(evaluateVideoWrite({ relativePath: finalPath, writer: "video-render-extra" }).decision, "deny");
  assert.equal(evaluateVideoWrite({ relativePath: "artifacts/video/launch-video/review.video.json", writer: "video-review" }).decision, "allow");
  assert.equal(evaluateVideoWrite({ relativePath: "artifacts/video/launch-video/review.video.json", writer: "video-probe" }).decision, "deny");
  assert.equal(evaluateVideoWrite({ relativePath: "artifacts/video/launch-video/.tmp/video-guard/capability.video-render.json", toolName: "Write" }).decision, "deny");
});

test("release receipt rejects a changed timeline dependency or output", () => {
  const model = validModel();
  Object.assign(model.files, {
    "dist/launch-video.mp4": "MP4-FINAL",
    "evidence.probe.json": "{}\n",
    "evidence.frames.json": "{}\n",
    "evidence.audio.json": "{}\n",
    "evidence.accessibility.json": "{}\n",
    "review.video.json": "{}\n",
    "release.manifest.json": "{}\n",
  });
  model.files["receipt.release.json"] = JSON.stringify(createVideoReceipt(model));

  assert.equal(validateVideoReceipt(model), true);
  model.files["src/timelines/VisualTimeline.tsx"] += "export const changed = true;\n";
  assert.equal(validateVideoReceipt(model), false);
});

test("release rejects forged media bytes and empty evidence objects", () => {
  const model = validModel();
  Object.assign(model.files, {
    "dist/launch-video.mp4": "not an mp4",
    "evidence.probe.json": "{}\n",
    "evidence.frames.json": "{}\n",
    "evidence.audio.json": "{}\n",
    "evidence.accessibility.json": "{}\n",
    "review.video.json": "{}\n",
    "release.manifest.json": "{}\n",
  });
  model.files["receipt.release.json"] = JSON.stringify(createVideoReceipt(model));

  const codes = validateVideoModel(model, { stage: "release" }).map(({ code }) => code);

  assert.ok(codes.includes("FINAL_RENDER_PROOF_INVALID"));
  assert.ok(codes.includes("PROBE_EVIDENCE_INVALID"));
  assert.ok(codes.includes("FRAME_EVIDENCE_INVALID"));
  assert.ok(codes.includes("AUDIO_EVIDENCE_INVALID"));
  assert.ok(codes.includes("ACCESSIBILITY_EVIDENCE_INVALID"));
  assert.ok(codes.includes("VIDEO_REVIEW_INVALID"));
  assert.ok(codes.includes("RELEASE_MANIFEST_INVALID"));
});

test("release rejects structured final proof facts that contradict the project", () => {
  const model = validModel();
  const { mediaPath, proofPath } = finalRenderPaths(model);
  model.files[mediaPath] = "MP4-FINAL";
  model.files[proofPath] = JSON.stringify({ ...createVideoRenderProof(model, {
    kind: "final",
    outputPath: mediaPath,
    media: { format: "wav", durationInFrames: 240, fps: 30, hasVideo: false, hasAudio: false, width: 0, height: 0 },
    script: "video:render:final",
  }), createdAt: "2026-01-01T00:00:00.000Z", sessionId: "render-session", triggerFrom: "test" });

  const codes = validateVideoModel(model, { stage: "release" }).map(({ code }) => code);

  assert.ok(codes.includes("FINAL_RENDER_PROOF_INVALID"));
});
