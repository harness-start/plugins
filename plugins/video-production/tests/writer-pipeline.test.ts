import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadVideoProject } from "../src/lib/project.js";
import { validateVideoModel } from "../src/lib/contract.js";
import { withWriterJournal } from "../src/lib/writer.js";

const TOOLS = fileURLToPath(new URL("../dist/cli/", import.meta.url));
const HOOK = fileURLToPath(new URL("../dist/hooks/video-production.mjs", import.meta.url));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function write(root, relativePath, content, executable = false) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  if (executable) chmodSync(target, 0o755);
}

function fixture(sandbox) {
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
    dependencies: { remotion: "1.0.0", "@remotion/cli": "1.0.0", react: "1.0.0", "react-dom": "1.0.0" },
  };
  const direction = JSON.stringify({ schema: "video-production/direction/v1", motionThesis: "A signal becomes a resolved outcome.", visualMetaphor: "signal path", narrativeArc: "hook, mechanism, resolution", motionGrammar: ["route", "resolve"], negativeRules: ["slide-deck pacing"] });
  const script = JSON.stringify({ schema: "video-production/script/v1", beats: [{ id: "demo", narration: "A short demonstration." }], claims: [] });
  const storyboard = JSON.stringify({ schema: "video-production/storyboard/v2", beats: [{ index: 1, id: "demo", startFrame: 0, endFrame: 10, narrativeJob: "demonstrate", movingObject: "signal", stateChange: "moves across the frame", cameraMotion: "stable", textRole: "label", assetIds: ["bed"], pptRisk: "static card" }] });
  const assets = JSON.stringify({ schema: "video-production/assets/v2", assets: [{ id: "bed", kind: "audio", source: "user", path: "public/audio/bed.wav", rights: "owned" }] });
  const workers = [
    ["motion-art-direction", "advisor"], ["animation-principles", "advisor"], ["beat-sync-editing", "advisor"], ["color-motion", "advisor"], ["shot-composition", "advisor"], ["explainer-video", "advisor"], ["short-form-video", "advisor"], ["caption-animation", "advisor"], ["product-launch-video", "advisor"], ["gemini-tts", "external-runner"], ["chengfeng-cut", "external-runner"], ["chengfeng-subtitle", "external-runner"], ["model-selector", "advisor"], ["prompt-translator", "advisor"], ["seedance-storyboard", "advisor"], ["impeccable", "advisor"],
  ].map(([name, mode]) => ({ name, mode, status: "skipped" }));
  const storyboardDigest = sha256(`plan.script.json\0${sha256(script)}\nplan.storyboard.json\0${sha256(storyboard)}\n`);
  const files = {
    ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
    "package.json": JSON.stringify(pkg),
    "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/remotion": { version: "1.0.0" }, "node_modules/@remotion/cli": { version: "1.0.0" }, "node_modules/react": { version: "1.0.0" }, "node_modules/react-dom": { version: "1.0.0" } } }),
    "plan.contract.json": JSON.stringify({ schema: "video-production/plan/v2", artifactId: "demo", profile: "motion-explainer", mode: "guided", targetStage: "release", audience: "test viewers", objective: "verify the delivery closure", platform: "test", language: "en", assumptions: [], externalBudget: { currency: "USD", limit: 0, spent: 0 } }),
    "plan.direction.json": direction,
    "plan.script.json": script,
    "plan.storyboard.json": storyboard,
    "plan.skill-composition.json": JSON.stringify({ schema: "video-production/skill-composition/v1", workers }),
    "plan.assets.json": assets,
    "plan.approvals.json": JSON.stringify({ schema: "video-production/approvals/v1", mode: "guided", gates: [{ stage: "direction", status: "approved", subjectSha256: sha256(direction), actor: "fixture", reason: "" }, { stage: "storyboard", status: "approved", subjectSha256: storyboardDigest, actor: "fixture", reason: "" }, { stage: "assets", status: "approved", subjectSha256: sha256(assets), actor: "fixture", reason: "" }] }),
    "plan.references.json": JSON.stringify({ schema: "video-production/references/v1", references: [] }),
    "design.system.json": JSON.stringify({ schema: "video-production/design-system/v1", colors: { canvas: "#111111", text: "#ffffff", accent: "#5eead4" }, typography: { displayPx: 96, bodyPx: 42, captionPx: 36 }, safeAreaPx: 80, motion: { enterFrames: 3, exitFrames: 3, easing: "ease-out" }, captions: { maxCharsPerSecond: 20, maxLines: 2 }, audio: { integratedLufs: -16, truePeakDb: -1 } }),
    "video.project.json": JSON.stringify({ schema: "video-production/project/v2", artifactId: "demo", profile: "motion-explainer", durationInFrames: 10, fps: 30, width: 1920, height: 1080, compositionId: "Main" }),
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
  for (const [relativePath, content] of Object.entries(files)) write(root, relativePath, content);
  write(bin, "ffprobe", `#!/usr/bin/env node\nif(process.argv.includes("-version")){process.stdout.write("ffprobe fixture 1.0\\n");process.exit(0)} const fs=require("node:fs"); const file=process.argv.at(-1); const body=fs.readFileSync(file,"utf8"); const audio=body.includes("WAV"); const final=body.includes("FINAL"); const streams=audio?[{codec_type:"audio",codec_name:"pcm_s16le",sample_rate:"48000",channels:2}]:[{codec_type:"video",codec_name:"h264",width:1920,height:1080,r_frame_rate:"30/1",avg_frame_rate:"30/1",nb_frames:"10"},...(final?[{codec_type:"audio",codec_name:"aac",sample_rate:"48000",channels:2}]:[])]; process.stdout.write(JSON.stringify({format:{format_name:audio?"wav":"mov,mp4",duration:"0.333333"},streams}));\n`, true);
  write(bin, "ffmpeg", "#!/usr/bin/env node\nconst fs=require('node:fs'); if(process.argv.includes('-version')){process.stdout.write('ffmpeg fixture 1.0\\n');process.exit(0)} if(process.argv.includes('ebur128=peak=true')){process.stderr.write('Summary:\\n  Integrated loudness:\\n    I: -16.0 LUFS\\n  True peak:\\n    Peak: -1.0 dBFS\\n');process.exit(0)} if(process.argv.includes('-vf')){fs.mkdirSync(require('node:path').dirname(process.argv.at(-1)),{recursive:true});fs.writeFileSync(process.argv.at(-1),'PNG-CONTACT');process.exit(0)} process.stdout.write(Buffer.from(`FRAME:${process.argv.join(' ')}`));\n", true);
  return { root, bin, visual, audio };
}

function run(script, args, { env = {}, sessionId = "writer-session" } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(TOOLS, script), ...args], {
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
  const command = ["node", join(TOOLS, script), ...args].map(shellWord).join(" ");
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK, "pre"], { stdio: ["pipe", "pipe", "pipe"] });
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
    writeFileSync(reviewInput, JSON.stringify({
      schema: "video-production/review-input/v2",
      artifactId: "demo",
      outputSha256: sha256("FAKE_FINAL_MP4"),
      verdict: "pass",
      reviewer: { kind: "independent-agent", id: "reviewer-1", sessionId: "review-session" },
      frames: [0, 5, 9],
      checks: { narrative: "pass", pacing: "pass", motionContinuity: "pass", shotComposition: "pass", typography: "pass", color: "pass", captions: "pass", audio: "pass", sourceIntegrity: "pass", assetRights: "pass", profileFidelity: "pass" },
      accessibility: { captionsReviewed: true, flashingReviewed: true, contrastReviewed: true },
      notes: "fixture review",
    }));
    const review = await runAuthorized("project-review.mjs", [fx.root, reviewInput], { env, sessionId: "review-session", cwd: sandbox });
    assert.equal(review.code, 0, review.stderr);

    const selfReleased = await runAuthorized("project-release.mjs", [fx.root], { env, sessionId: "review-session", cwd: sandbox });
    assert.equal(selfReleased.code, 2);
    assert.match(selfReleased.stderr, /REVIEW_RELEASE_SESSION_COLLISION/u);

    const release = await runAuthorized("project-release.mjs", [fx.root], { env, sessionId: "writer-session", cwd: sandbox });
    assert.equal(release.code, 0, release.stderr);

    const model = await loadVideoProject(fx.root);
    assert.deepEqual(validateVideoModel(model, { stage: "release" }), []);
    assert.match(model.files["src/visual/v001-intro.f000000-f000010.tsx"], /Intro/u);
    assert.equal(JSON.parse(model.files["dist/demo.mp4.proof.json"]).writer.capability, "video-render");
    assert.equal(JSON.parse(model.files["evidence.probe.json"]).schema, "video-production/probe-evidence/v1");
    assert.equal(JSON.parse(model.files["review.video.json"]).reviewer.sessionId, "review-session");
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
    writeFileSync(input, JSON.stringify({ schema: "video-production/review-input/v2", artifactId: "demo", outputSha256: sha256("FAKE_FINAL_MP4"), verdict: "pass", reviewer: { kind: "independent-agent", id: "forged-other-session", sessionId: "forged-session" }, frames: [0, 5, 9], checks: { narrative: "pass", pacing: "pass", motionContinuity: "pass", shotComposition: "pass", typography: "pass", color: "pass", captions: "pass", audio: "pass", sourceIntegrity: "pass", assetRights: "pass", profileFidelity: "pass" }, accessibility: { captionsReviewed: true, flashingReviewed: true, contrastReviewed: true } }));

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
