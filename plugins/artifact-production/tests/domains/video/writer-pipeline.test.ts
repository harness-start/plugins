import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { syntaxDiagnostics } from "../../../../../core/tests/support/typescript-source.js";
import { loadVideoProject } from "../../../src/domains/video/lib/project.js";
import { validateVideoModel } from "../../../src/domains/video/lib/contract.js";
import { withWriterJournal } from "../../../src/domains/video/lib/writer.js";

const HARNESS = fileURLToPath(new URL("../../../dist/cli/harness.mjs", import.meta.url));
const HOOK = fileURLToPath(new URL("../../../dist/hooks/dispatcher.mjs", import.meta.url));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const COMMUNICATION_CORE = {
  coreIntent: "Show one signal becoming coordinated work.",
  audienceOutcome: "Viewers can repeat how the signal resolves into a system.",
  retellTarget: "One signal becomes coordinated work.",
  signatureCue: { description: "The signal crossing one resolved path", semanticRole: "Core operating transformation", anchors: ["beat:demo"] },
  semanticLink: "The visible state change directly represents coordination.",
  invariants: ["one signal remains traceable through every state"],
  prohibitedDrift: ["decorative motion without a state change"],
};

function communicationReviewFields() {
  return {
    reviewerRetell: { observedBeforeContract: COMMUNICATION_CORE.retellTarget, intendedTarget: COMMUNICATION_CORE.retellTarget, alignment: "pass", limitation: "Independent reviewer proxy; not a human recall study." },
    communicationReview: Object.fromEntries(["coreFidelity", "signatureCue", "semanticCausality", "retellAlignment", "invariantContinuity"].map((key) => [key, { status: "pass", anchor: "beat:demo", evidence: `${key} is visible in the reviewed video.`, recovery: `Revise ${key} and repeat independent review.` }])),
  };
}

function write(root, relativePath, content, executable = false) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  if (executable) chmodSync(target, 0o755);
}

function fixture(sandbox, { shotCraft = false } = {}) {
  const root = join(sandbox, "artifacts", "video", "demo");
  const bin = join(sandbox, "bin");
  const visual = "export function Intro() { return <div />; }\n";
  const audio = JSON.stringify({ asset: "public/audio/bed.wav", role: "music", startFrame: 0, endFrame: 10 });
  const pkg = {
    scripts: {
      "video:render:visual": "node tools/fake-render.mjs visual",
      "video:render:audio": "node tools/fake-render.mjs audio",
      "video:render:final": "node tools/fake-render.mjs final",
    },
    dependencies: { remotion: "1.0.0", "@remotion/cli": "1.0.0", ...(shotCraft ? { "@remotion/motion-blur": "1.0.0" } : {}), react: "1.0.0", "react-dom": "1.0.0" },
  };
  const direction = JSON.stringify({ schema: "video-production/direction/v2", communicationCore: COMMUNICATION_CORE, motionThesis: "A signal becomes a resolved outcome.", visualMetaphor: "signal path", narrativeArc: "hook, mechanism, resolution", motionGrammar: ["route", "resolve"], negativeRules: ["slide-deck pacing"] });
  const script = JSON.stringify({ schema: "video-production/script/v1", beats: [{ id: "demo", narration: "A short demonstration." }], claims: [] });
  const storyboard = JSON.stringify({ schema: "video-production/storyboard/v3", beats: [{ index: 1, id: "demo", startFrame: 0, endFrame: 10, narrativeJob: "demonstrate", coreContribution: "Shows the transformation named by the retell target.", movingObject: "signal", stateChange: "moves across the frame", cameraMotion: "stable", textRole: "label", assetIds: ["bed"], pptRisk: "static card" }] });
  const assets = JSON.stringify({ schema: "video-production/assets/v2", assets: [{ id: "bed", kind: "audio", source: "user", path: "public/audio/bed.wav", rights: "owned" }] });
  const workers = [
    ["video-motion-direction", "advisor"], ["video-format-playbooks", "advisor"], ["video-visual-critique", "advisor"], ["video-media-import", "external-runner"],
    ...(shotCraft ? [["video-shot-recipes", "advisor"]] : []),
  ].map(([name, mode]) => ({ name, mode, status: "skipped" }));
  const shots = shotCraft ? JSON.stringify({ schema: "video-production/shot-plan/v1", catalogRevision: "0d6f0b57f0d4d6700761644c07f7ef03c3e50234", selections: [{ beatId: "demo", recipeId: "deck-deal-flyin", styleId: "deck-deal-flyin", usage: "adapted", adaptationNotes: "Apply the accelerating card cadence to the signal proof.", implementationPath: "src/visual/v001-intro.f000000-f000010.tsx", reviewFrames: [0, 5, 9] }], customBeats: [] }) : undefined;
  const storyboardDigest = sha256(`plan.script.json\0${sha256(script)}\nplan.storyboard.json\0${sha256(storyboard)}\n${shots === undefined ? "" : `plan.shots.json\0${sha256(shots)}\n`}`);
  const files = {
    ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
    "package.json": JSON.stringify(pkg),
    "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/remotion": { version: "1.0.0" }, "node_modules/@remotion/cli": { version: "1.0.0" }, ...(shotCraft ? { "node_modules/@remotion/motion-blur": { version: "1.0.0" } } : {}), "node_modules/react": { version: "1.0.0" }, "node_modules/react-dom": { version: "1.0.0" } } }),
    "plan.contract.json": JSON.stringify({ schema: "video-production/plan/v2", artifactId: "demo", profile: shotCraft ? "product-promo" : "motion-explainer", mode: "guided", targetStage: "release", audience: "test viewers", objective: "verify the delivery closure", platform: "test", language: "en", assumptions: [], externalBudget: { currency: "USD", limit: 0, spent: 0 }, ...(shotCraft ? { craft: { shotPlanning: "required", remotionLicense: "free-license" } } : {}) }),
    "plan.direction.json": direction,
    "plan.script.json": script,
    "plan.storyboard.json": storyboard,
    "plan.skill-composition.json": JSON.stringify({ schema: "video-production/skill-composition/v1", workers }),
    "plan.assets.json": assets,
    "plan.approvals.json": JSON.stringify({ schema: "video-production/approvals/v1", mode: "guided", gates: [{ stage: "direction", status: "approved", subjectSha256: sha256(direction), actor: "fixture", reason: "" }, { stage: "storyboard", status: "approved", subjectSha256: storyboardDigest, actor: "fixture", reason: "" }, { stage: "assets", status: "approved", subjectSha256: sha256(assets), actor: "fixture", reason: "" }] }),
    "plan.references.json": JSON.stringify({ schema: "video-production/references/v1", references: [] }),
    "design.system.json": JSON.stringify({ schema: "video-production/design-system/v1", colors: { canvas: "#111111", text: "#ffffff", accent: "#5eead4" }, typography: { displayPx: 96, bodyPx: 42, captionPx: 36 }, safeAreaPx: 80, motion: { enterFrames: 3, exitFrames: 3, easing: "ease-out" }, captions: { maxCharsPerSecond: 20, maxLines: 2 }, audio: { integratedLufs: -16, truePeakDb: -1 } }),
    "video.project.json": JSON.stringify({ schema: "video-production/project/v2", artifactId: "demo", profile: shotCraft ? "product-promo" : "motion-explainer", durationInFrames: 10, fps: 30, width: 1920, height: 1080, compositionId: "Main" }),
    "src/index.ts": "registerRoot(Root);\n",
    "src/Root.tsx": "export const Root = () => <Composition id='main' />;\n",
    "src/Video.tsx": "export const Video = () => <><VisualTimeline/><AudioTimeline/><CaptionTimeline/></>;\n",
    "src/timelines/VisualTimeline.tsx": "import manifest from '../visual/manifest.json'; export const VisualTimeline = () => manifest.units.length;\n",
    "src/timelines/AudioTimeline.tsx": "import manifest from '../audio/manifest.json'; export const AudioTimeline = () => manifest.units.length;\n",
    "src/timelines/CaptionTimeline.tsx": "import manifest from '../captions/manifest.json'; export const CaptionTimeline = () => manifest.units.length;\n",
    "src/visual/manifest.json": JSON.stringify({ units: [{ index: 1, id: "intro", startFrame: 0, endFrame: 10, source: "v001-intro.f000000-f000010.tsx" }] }),
    "src/visual/v001-intro.f000000-f000010.tsx": visual,
    "src/audio/manifest.json": JSON.stringify({ units: [{ index: 1, id: "bed", role: "music", startFrame: 0, endFrame: 10, source: "a001-music-bed.f000000-f000010.audio.json" }] }),
    "src/audio/a001-music-bed.f000000-f000010.audio.json": audio,
    "public/audio/bed.wav": "SOURCE_AUDIO",
    "src/captions/manifest.json": JSON.stringify({ units: [] }),
    "tools/fake-render.mjs": `import { mkdirSync, writeFileSync } from "node:fs"; import { dirname } from "node:path"; const args = Object.fromEntries(process.argv.slice(3).reduce((out, value, index, all) => index % 2 === 0 ? [...out, [value.replace(/^--/, ""), all[index + 1]]] : out, [])); mkdirSync(dirname(args.output), { recursive: true }); writeFileSync(args.output, process.argv[2] === "audio" ? "FAKE_WAV" : process.argv[2] === "final" ? "FAKE_FINAL_MP4" : "FAKE_VISUAL_MP4");\n`,
  };
  if (shots !== undefined) files["plan.shots.json"] = shots;
  for (const [relativePath, content] of Object.entries(files)) write(root, relativePath, content);
  write(bin, "ffprobe", `#!/usr/bin/env node\nif(process.argv.includes("-version")){process.stdout.write("ffprobe fixture 1.0\\n");process.exit(0)} const fs=require("node:fs"); const file=process.argv.at(-1); const body=fs.readFileSync(file,"utf8"); const audio=body.includes("WAV"); const final=body.includes("FINAL"); const streams=audio?[{codec_type:"audio",codec_name:"pcm_s16le",sample_rate:"48000",channels:2}]:[{codec_type:"video",codec_name:"h264",width:1920,height:1080,r_frame_rate:"30/1",avg_frame_rate:"30/1",nb_frames:"10"},...(final?[{codec_type:"audio",codec_name:"aac",sample_rate:"48000",channels:2}]:[])]; process.stdout.write(JSON.stringify({format:{format_name:audio?"wav":"mov,mp4",duration:"0.333333"},streams}));\n`, true);
  write(bin, "ffmpeg", "#!/usr/bin/env node\nconst fs=require('node:fs'); if(process.argv.includes('-version')){process.stdout.write('ffmpeg fixture 1.0\\n');process.exit(0)} if(process.argv.includes('ebur128=peak=true')){process.stderr.write('Summary:\\n  Integrated loudness:\\n    I: -16.0 LUFS\\n  True peak:\\n    Peak: -1.0 dBFS\\n');process.exit(0)} if(process.argv.some((value)=>value.includes('signalstats'))){const black=process.env.FAKE_BLACK_FRAME==='1';process.stderr.write(`lavfi.signalstats.YAVG=${black?16:64}\\nlavfi.signalstats.YMAX=${black?16:192}\\n`);process.exit(0)} if(process.argv.includes('-vf')){fs.mkdirSync(require('node:path').dirname(process.argv.at(-1)),{recursive:true});fs.writeFileSync(process.argv.at(-1),'PNG-CONTACT');process.exit(0)} process.stdout.write(Buffer.from(`FRAME:${process.argv.join(' ')}`));\n", true);
  return { root, bin, visual, audio };
}

function run(script, args, { env = {}, sessionId = "writer-session" } = {}) {
  const action = script.replace(/^project-|\.mjs$/gu, "");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HARNESS, "video", action, ...args], {
      env: { ...process.env, ...env, AI_EXPERTS_SESSION_ID: sessionId, AI_EXPERTS_TRIGGER_FROM: "test" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function shellWord(value) {
  return JSON.stringify(String(value));
}

async function authorize(script, args, { cwd, sessionId }) {
  const action = script.replace(/^project-|\.mjs$/gu, "");
  const command = ["node", HARNESS, "video", action, ...args].map(shellWord).join(" ");
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK, "codex", "PreToolUse"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify({ cwd, session_id: sessionId, tool_name: "Bash", tool_input: { command } }));
  });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), "", `writer authorization denied: ${result.stdout}`);
}

async function runAuthorized(script, args, { env, sessionId, cwd }) {
  await authorize(script, args, { cwd, sessionId });
  return run(script, args, { env, sessionId });
}

test("registered writers produce a structured render-probe-review-release closure", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "video-writer-pipeline-"));
  try {
    const fx = fixture(sandbox);
    const env = { PATH: `${fx.bin}:${process.env.PATH}` };

    for (const [kind, source] of [["visual", "v001-intro.f000000-f000010.tsx"], ["audio", "a001-music-bed.f000000-f000010.audio.json"], ["final", null]]) {
      const result = await runAuthorized("project-render.mjs", [fx.root, kind, ...(source ? [source] : [])], { env, sessionId: "writer-session", cwd: sandbox });
      assert.equal(result.code, 0, result.stderr);
    }

    const probe = await runAuthorized("project-probe.mjs", [fx.root], { env, sessionId: "writer-session", cwd: sandbox });
    assert.equal(probe.code, 0, probe.stderr);

    const reviewInput = join(sandbox, "review-input.json");
    const reviewPayload = {
      schema: "video-production/review-input/v3",
      artifactId: "demo",
      outputSha256: sha256("FAKE_FINAL_MP4"),
      verdict: "pass",
      reviewer: { kind: "independent-agent", id: "reviewer-1", sessionId: "review-session" },
      frames: [0, 5, 9],
      checks: { narrative: "pass", pacing: "pass", motionContinuity: "pass", shotComposition: "pass", typography: "pass", color: "pass", captions: "pass", audio: "pass", sourceIntegrity: "pass", assetRights: "pass", profileFidelity: "pass" },
      accessibility: { captionsReviewed: true, flashingReviewed: true, contrastReviewed: true },
      ...communicationReviewFields(),
      notes: "fixture review",
    };
    reviewPayload.communicationReview.signatureCue.anchor = "beat:missing";
    writeFileSync(reviewInput, JSON.stringify(reviewPayload));
    const unboundReview = await runAuthorized("project-review.mjs", [fx.root, reviewInput], { env, sessionId: "review-session", cwd: sandbox });
    assert.equal(unboundReview.code, 2);
    assert.match(unboundReview.stderr, /COMMUNICATION_REVIEW_INCOMPLETE/u);
    reviewPayload.communicationReview.signatureCue.anchor = "beat:demo";
    writeFileSync(reviewInput, JSON.stringify(reviewPayload));
    const review = await runAuthorized("project-review.mjs", [fx.root, reviewInput], { env, sessionId: "review-session", cwd: sandbox });
    assert.equal(review.code, 0, review.stderr);

    const selfReleased = await runAuthorized("project-release.mjs", [fx.root], { env, sessionId: "review-session", cwd: sandbox });
    assert.equal(selfReleased.code, 2);
    assert.match(selfReleased.stderr, /REVIEW_RELEASE_SESSION_COLLISION/u);

    const release = await runAuthorized("project-release.mjs", [fx.root], { env, sessionId: "writer-session", cwd: sandbox });
    assert.equal(release.code, 0, release.stderr);

    const model = await loadVideoProject(fx.root);
    assert.deepEqual(validateVideoModel(model, { stage: "release" }), []);
    const visualSource = model.files["src/visual/v001-intro.f000000-f000010.tsx"];
    assert.equal(visualSource, fx.visual);
    assert.deepEqual(syntaxDiagnostics(visualSource, "v001-intro.f000000-f000010.tsx"), []);
    assert.equal(JSON.parse(model.files["dist/demo.mp4.proof.json"]).writer.capability, "video-render");
    assert.equal(JSON.parse(model.files["evidence.probe.json"]).schema, "video-production/probe-evidence/v1");
    assert.equal(JSON.parse(model.files["review.video.json"]).reviewer.sessionId, "review-session");
    assert.equal(JSON.parse(model.files["review.video.json"]).reviewerRetell.intendedTarget, COMMUNICATION_CORE.retellTarget);
    assert.equal(JSON.parse(model.files["review.video.json"]).communicationReview.signatureCue.status, "pass");
    assert.equal(JSON.parse(model.files["receipt.release.json"]).schemaVersion, 3);

    const forgedProbe = JSON.parse(model.files["evidence.probe.json"]);
    forgedProbe.video.width = 1;
    writeFileSync(join(fx.root, "evidence.probe.json"), JSON.stringify(forgedProbe));
    const forgedFrames = JSON.parse(model.files["evidence.frames.json"]);
    forgedFrames.frames = forgedFrames.frames.map((entry, index) => ({ ...entry, frame: index + 1 }));
    writeFileSync(join(fx.root, "evidence.frames.json"), JSON.stringify(forgedFrames));
    const forgedModel = await loadVideoProject(fx.root);
    const forgedCodes = validateVideoModel(forgedModel, { stage: "release" }).map(({ code }) => code);
    assert.ok(forgedCodes.includes("PROBE_EVIDENCE_INVALID"));
    assert.ok(forgedCodes.includes("FRAME_EVIDENCE_INVALID"));
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("near-black probe samples require explicit independent review before release", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "video-black-frame-review-"));
  try {
    const fx = fixture(sandbox);
    const env = { PATH: `${fx.bin}:${process.env.PATH}`, FAKE_BLACK_FRAME: "1" };
    for (const [kind, source] of [["visual", "v001-intro.f000000-f000010.tsx"], ["audio", "a001-music-bed.f000000-f000010.audio.json"], ["final", null]]) {
      const rendered = await runAuthorized("project-render.mjs", [fx.root, kind, ...(source ? [source] : [])], { env, sessionId: "black-render-session", cwd: sandbox });
      assert.equal(rendered.code, 0, rendered.stderr);
    }

    const probed = await runAuthorized("project-probe.mjs", [fx.root], { env, sessionId: "black-render-session", cwd: sandbox });
    assert.equal(probed.code, 0, probed.stderr);
    const motion = JSON.parse(readFileSync(join(fx.root, "evidence.motion.json"), "utf8"));
    assert.deepEqual(motion.blackFrameThreshold, { yAvgMax: 20, yMaxMax: 32 });
    assert.deepEqual(motion.blackCandidates.map(({ frame }) => frame), [0, 4, 9]);
    assert.deepEqual(motion.blackCandidates.map(({ luma }) => luma), [
      { yAvg: 16, yMax: 16 },
      { yAvg: 16, yMax: 16 },
      { yAvg: 16, yMax: 16 },
    ]);

    const reviewInput = join(sandbox, "black-review-input.json");
    const input = {
      schema: "video-production/review-input/v3",
      artifactId: "demo",
      outputSha256: sha256("FAKE_FINAL_MP4"),
      verdict: "pass",
      reviewer: { kind: "independent-agent", id: "black-reviewer", sessionId: "black-review-session" },
      frames: [0, 4, 9],
      checks: { narrative: "pass", pacing: "pass", motionContinuity: "pass", shotComposition: "pass", typography: "pass", color: "pass", captions: "pass", audio: "pass", sourceIntegrity: "pass", assetRights: "pass", profileFidelity: "pass" },
      accessibility: { captionsReviewed: true, flashingReviewed: true, contrastReviewed: true },
      ...communicationReviewFields(),
      blackFrameAssessments: [] as Array<{ frame: number | string; classification: string; notes: string }>,
    };
    writeFileSync(reviewInput, JSON.stringify(input));
    const incomplete = await runAuthorized("project-review.mjs", [fx.root, reviewInput], { env, sessionId: "black-review-session", cwd: sandbox });
    assert.equal(incomplete.code, 2);
    assert.match(incomplete.stderr, /BLACK_FRAME_REVIEW_INCOMPLETE/u);

    input.blackFrameAssessments = [
      { frame: "0", classification: "expected", notes: "Wrong frame type." },
      { frame: "4", classification: "expected", notes: "Wrong frame type." },
      { frame: "9", classification: "expected", notes: "Wrong frame type." },
    ];
    writeFileSync(reviewInput, JSON.stringify(input));
    const wrongTypes = await runAuthorized("project-review.mjs", [fx.root, reviewInput], { env, sessionId: "black-review-session", cwd: sandbox });
    assert.equal(wrongTypes.code, 2);
    assert.match(wrongTypes.stderr, /BLACK_FRAME_REVIEW_INCOMPLETE/u);

    input.blackFrameAssessments = [
      { frame: 0, classification: "expected", notes: "Intentional black opening." },
      { frame: 4, classification: "unexpected", notes: "Render dropped the middle scene." },
      { frame: 9, classification: "expected", notes: "Intentional black closing." },
    ];
    writeFileSync(reviewInput, JSON.stringify(input));
    const failed = await runAuthorized("project-review.mjs", [fx.root, reviewInput], { env, sessionId: "black-review-session", cwd: sandbox });
    assert.equal(failed.code, 2);
    assert.match(failed.stderr, /BLACK_FRAME_REVIEW_FAILED/u);

    input.blackFrameAssessments[1].classification = "expected";
    input.blackFrameAssessments[1].notes = "The middle beat intentionally cuts to black.";
    writeFileSync(reviewInput, JSON.stringify(input));
    const reviewed = await runAuthorized("project-review.mjs", [fx.root, reviewInput], { env, sessionId: "black-review-session", cwd: sandbox });
    assert.equal(reviewed.code, 0, reviewed.stderr);
    const review = JSON.parse(readFileSync(join(fx.root, "review.video.json"), "utf8"));
    assert.deepEqual(review.blackFrameAssessments, input.blackFrameAssessments);

    const released = await runAuthorized("project-release.mjs", [fx.root], { env, sessionId: "black-release-session", cwd: sandbox });
    assert.equal(released.code, 0, released.stderr);
    const releasedModel = await loadVideoProject(fx.root);
    assert.deepEqual(validateVideoModel(releasedModel, { stage: "release" }), []);

    const motionPath = join(fx.root, "evidence.motion.json");
    const currentMotionBytes = readFileSync(motionPath, "utf8");
    const duplicatedMotion = JSON.parse(currentMotionBytes);
    duplicatedMotion.blackCandidates = duplicatedMotion.blackCandidates.map(() => duplicatedMotion.blackCandidates[0]);
    writeFileSync(motionPath, JSON.stringify(duplicatedMotion));
    const duplicateCandidateCodes = validateVideoModel(await loadVideoProject(fx.root), { stage: "release" }).map(({ code }) => code);
    assert.ok(duplicateCandidateCodes.includes("MOTION_EVIDENCE_INVALID"));

    writeFileSync(motionPath, currentMotionBytes);
    writeFileSync(motionPath, JSON.stringify(JSON.parse(currentMotionBytes), null, 2));
    const staleReviewCodes = validateVideoModel(await loadVideoProject(fx.root), { stage: "release" }).map(({ code }) => code);
    assert.ok(staleReviewCodes.includes("VIDEO_REVIEW_INVALID"));
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("shot-aware probe and review bind selected fidelity frames into release evidence", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "video-shot-evidence-"));
  try {
    const fx = fixture(sandbox, { shotCraft: true });
    const env = { PATH: `${fx.bin}:${process.env.PATH}` };
    for (const [kind, source] of [["visual", "v001-intro.f000000-f000010.tsx"], ["audio", "a001-music-bed.f000000-f000010.audio.json"], ["final", null]]) {
      const rendered = await runAuthorized("project-render.mjs", [fx.root, kind, ...(source ? [source] : [])], { env, sessionId: "shot-render-session", cwd: sandbox });
      assert.equal(rendered.code, 0, rendered.stderr);
    }

    const probed = await runAuthorized("project-probe.mjs", [fx.root], { env, sessionId: "shot-render-session", cwd: sandbox });

    assert.equal(probed.code, 0, probed.stderr);
    const evidence = JSON.parse(readFileSync(join(fx.root, "evidence.shots.json"), "utf8"));
    assert.equal(evidence.schema, "video-production/shot-evidence/v1");
    assert.equal(evidence.catalogRevision, "0d6f0b57f0d4d6700761644c07f7ef03c3e50234");
    assert.deepEqual(evidence.selections[0].reviewFrames.map(({ frame }) => frame), [0, 5, 9]);
    assert.equal(evidence.selections[0].implementationSha256, sha256(fx.visual));

    const reviewInput = join(sandbox, "shot-review-input.json");
    const checks: Record<string, string> = { narrative: "pass", pacing: "pass", motionContinuity: "pass", shotComposition: "pass", typography: "pass", color: "pass", captions: "pass", audio: "pass", sourceIntegrity: "pass", assetRights: "pass", profileFidelity: "pass" };
    const input = {
      schema: "video-production/review-input/v3",
      artifactId: "demo",
      outputSha256: sha256("FAKE_FINAL_MP4"),
      verdict: "pass",
      reviewer: { kind: "independent-agent", id: "shot-reviewer", sessionId: "shot-review-session" },
      frames: [0, 5, 9],
      checks,
      accessibility: { captionsReviewed: true, flashingReviewed: true, contrastReviewed: true },
      ...communicationReviewFields(),
    };
    writeFileSync(reviewInput, JSON.stringify(input));
    const incomplete = await runAuthorized("project-review.mjs", [fx.root, reviewInput], { env, sessionId: "shot-review-session", cwd: sandbox });
    assert.equal(incomplete.code, 2);
    assert.match(incomplete.stderr, /PROFILE_REVIEW_INCOMPLETE/u);
    input.checks.shotFidelity = "pass";
    writeFileSync(reviewInput, JSON.stringify(input));
    const reviewed = await runAuthorized("project-review.mjs", [fx.root, reviewInput], { env, sessionId: "shot-review-session", cwd: sandbox });
    assert.equal(reviewed.code, 0, reviewed.stderr);
    const released = await runAuthorized("project-release.mjs", [fx.root], { env, sessionId: "shot-release-session", cwd: sandbox });
    assert.equal(released.code, 0, released.stderr);
    const model = await loadVideoProject(fx.root);
    assert.deepEqual(validateVideoModel(model, { stage: "release" }), []);
    assert.equal(Object.hasOwn(JSON.parse(model.files["release.manifest.json"]).outputs, "evidence.shots.json"), true);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("review writer rejects a self-review from the release session", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "video-writer-self-review-"));
  try {
    const fx = fixture(sandbox);
    const env = { PATH: `${fx.bin}:${process.env.PATH}` };
    for (const [kind, source] of [["visual", "v001-intro.f000000-f000010.tsx"], ["audio", "a001-music-bed.f000000-f000010.audio.json"], ["final", null]]) {
      const rendered = await runAuthorized("project-render.mjs", [fx.root, kind, ...(source ? [source] : [])], { env, sessionId: "same-session", cwd: sandbox });
      assert.equal(rendered.code, 0, rendered.stderr);
    }
    const probed = await runAuthorized("project-probe.mjs", [fx.root], { env, sessionId: "same-session", cwd: sandbox });
    assert.equal(probed.code, 0, probed.stderr);
    const input = join(sandbox, "self-review.json");
    writeFileSync(input, JSON.stringify({ schema: "video-production/review-input/v3", artifactId: "demo", outputSha256: sha256("FAKE_FINAL_MP4"), verdict: "pass", reviewer: { kind: "independent-agent", id: "forged-other-session", sessionId: "forged-session" }, frames: [0, 5, 9], checks: { narrative: "pass", pacing: "pass", motionContinuity: "pass", shotComposition: "pass", typography: "pass", color: "pass", captions: "pass", audio: "pass", sourceIntegrity: "pass", assetRights: "pass", profileFidelity: "pass" }, accessibility: { captionsReviewed: true, flashingReviewed: true, contrastReviewed: true }, ...communicationReviewFields() }));

    const result = await runAuthorized("project-review.mjs", [fx.root, input], { env, sessionId: "same-session", cwd: sandbox });

    assert.equal(result.code, 2);
    assert.match(result.stderr, /SELF_REVIEW_DENIED/u);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("render writer fails when the declared project script produces no output", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "video-writer-missing-output-"));
  try {
    const fx = fixture(sandbox);
    const packagePath = join(fx.root, "package.json");
    const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
    write(fx.root, "tools/no-output.mjs", "// intentionally produces no output\n");
    pkg.scripts["video:render:final"] = "node tools/no-output.mjs";
    writeFileSync(packagePath, JSON.stringify(pkg));

    const result = await runAuthorized("project-render.mjs", [fx.root, "final"], { env: { PATH: `${fx.bin}:${process.env.PATH}` }, sessionId: "writer-session", cwd: sandbox });

    assert.equal(result.code, 2);
    assert.match(result.stderr, /RENDER_OUTPUT_MISSING/u);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("writer refuses direct execution without a PreToolUse capability grant", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "video-writer-capability-"));
  try {
    const fx = fixture(sandbox);

    const result = await run("project-render.mjs", [fx.root, "visual", "v001-intro.f000000-f000010.tsx"], { env: { PATH: `${fx.bin}:${process.env.PATH}` }, sessionId: "direct-session" });

    assert.equal(result.code, 2);
    assert.match(result.stderr, /WRITER_CAPABILITY_MISSING/u);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("failed writer keeps its mutation journal for Stop recovery", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "video-writer-journal-"));
  try {
    const fx = fixture(sandbox);
    mkdirSync(join(fx.root, "dist"), { recursive: true });

    await assert.rejects(
      withWriterJournal(fx.root, "video-render", async () => {
        writeFileSync(join(fx.root, "dist", "partial.mp4"), "partial");
        throw new Error("simulated writer failure");
      }, { sessionId: "writer-session", triggerFrom: "test" }),
      /simulated writer failure/u,
    );

    assert.equal(existsSync(join(fx.root, ".video-delivery-journal.json")), true);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
