import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateVideoModel } from "../src/lib/contract.js";
import { loadVideoProject } from "../src/lib/project.js";

const TOOLS = fileURLToPath(new URL("../dist/cli/", import.meta.url));
const HOOK = fileURLToPath(new URL("../dist/hooks/video-project-delivery-guard.mjs", import.meta.url));

function write(path: string, content: string, executable = false) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  if (executable) chmodSync(path, 0o755);
}

function run(script: string, args: string[], { env, sessionId }: { env: NodeJS.ProcessEnv; sessionId: string }) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [join(TOOLS, script), ...args], { env: { ...process.env, ...env, AI_EXPERTS_SESSION_ID: sessionId, AI_EXPERTS_TRIGGER_FROM: "test" }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function authorize(script: string, args: string[], cwd: string, sessionId: string) {
  const command = ["node", join(TOOLS, script), ...args].map((value) => JSON.stringify(value)).join(" ");
  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
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
  assert.equal(result.stdout.trim(), "", `authorization denied: ${result.stdout}`);
}

function fakeToolchain(sandbox: string) {
  const bin = join(sandbox, "bin");
  write(join(bin, "npm"), `#!/usr/bin/env node
const fs=require("node:fs");
fs.writeFileSync("package-lock.json", JSON.stringify({lockfileVersion:3,packages:{"node_modules/remotion":{version:"4.0.512"},"node_modules/@remotion/cli":{version:"4.0.512"},"node_modules/react":{version:"19.2.8"},"node_modules/react-dom":{version:"19.2.8"}}}));
`, true);
  write(join(bin, "ffprobe"), `#!/usr/bin/env node
if(process.argv.includes("-version")){process.stdout.write("ffprobe fixture 1.0\\n");process.exit(0)}
process.stdout.write(JSON.stringify({format:{format_name:"wav",duration:"1"},streams:[{codec_type:"audio",codec_name:"pcm_s16le",sample_rate:"48000",channels:1}]}));
`, true);
  return { PATH: `${bin}:${process.env.PATH}` };
}

async function initialize(sandbox: string, env: NodeJS.ProcessEnv) {
  const root = join(sandbox, "artifacts", "video", "demo");
  const args = [root, "--profile", "short-form", "--mode", "guided"];
  await authorize("project-init.mjs", args, sandbox, "producer-session");
  const result = await run("project-init.mjs", args, { env, sessionId: "producer-session" });
  assert.equal(result.code, 0, result.stderr);
  return root;
}

test("project initializer creates a source-stage v2 scaffold through a capability-bound command", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "video-init-"));
  try {
    const root = await initialize(sandbox, fakeToolchain(sandbox));

    const model = await loadVideoProject(root);
    assert.deepEqual(validateVideoModel(model, { stage: "source" }), []);
    assert.equal(JSON.parse(String(model.files?.["plan.contract.json"])).profile, "short-form");
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("admission copies a declared external asset and records declared provenance", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "video-admit-"));
  try {
    const env = fakeToolchain(sandbox);
    const root = await initialize(sandbox, env);
    const planPath = join(root, "plan.contract.json");
    const plan = JSON.parse(readFileSync(planPath, "utf8"));
    plan.externalBudget = { currency: "USD", limit: 5, spent: 1 };
    writeFileSync(planPath, JSON.stringify(plan));
    const compositionPath = join(root, "plan.skill-composition.json");
    const composition = JSON.parse(readFileSync(compositionPath, "utf8"));
    composition.workers.find((worker: { name: string }) => worker.name === "gemini-tts").status = "used";
    writeFileSync(compositionPath, JSON.stringify(composition));
    const script = JSON.stringify({ schema: "video-project-delivery-guard/script/v1", beats: [{ id: "hook", narration: "Hook" }, { id: "body", narration: "Body" }], claims: [] });
    const storyboard = JSON.stringify({ schema: "video-project-delivery-guard/storyboard/v2", beats: [{ index: 1, id: "hook", startFrame: 0, endFrame: 90, narrativeJob: "hook", movingObject: "title", stateChange: "reveals", cameraMotion: "push", textRole: "headline", assetIds: [], pptRisk: "static title" }, { index: 2, id: "body", startFrame: 90, endFrame: 900, narrativeJob: "explain", movingObject: "waveform", stateChange: "expands", cameraMotion: "track", textRole: "label", assetIds: ["voice"], pptRisk: "static card" }] });
    const assets = JSON.stringify({ schema: "video-project-delivery-guard/assets/v2", assets: [{ id: "voice", kind: "audio", source: "external-run", runId: "tts-1", path: "public/admitted/voice.wav", rights: "generated-and-licensed" }] });
    writeFileSync(join(root, "plan.script.json"), script);
    writeFileSync(join(root, "plan.storyboard.json"), storyboard);
    writeFileSync(join(root, "plan.assets.json"), assets);
    const direction = readFileSync(join(root, "plan.direction.json"), "utf8");
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    writeFileSync(join(root, "plan.approvals.json"), JSON.stringify({ schema: "video-project-delivery-guard/approvals/v1", mode: "guided", gates: [{ stage: "direction", status: "approved", subjectSha256: hash(direction), actor: "fixture", reason: "" }, { stage: "storyboard", status: "approved", subjectSha256: hash(`plan.script.json\0${hash(script)}\nplan.storyboard.json\0${hash(storyboard)}\n`), actor: "fixture", reason: "" }, { stage: "assets", status: "approved", subjectSha256: hash(assets), actor: "fixture", reason: "" }] }));
    const candidate = join(sandbox, "external", "voice.wav");
    write(candidate, "WAV-CANDIDATE");
    const digest = createHash("sha256").update("WAV-CANDIDATE").digest("hex");
    const manifest = join(sandbox, "tts-1.json");
    const runManifest = { schema: "video-project-delivery-guard/external-run/v1", artifactId: "demo", runId: "tts-1", skill: { name: "gemini-tts", revision: "9de027d1947ce8f8b60ccf70aa89e482bf80ecea", mode: "external-runner" }, provider: { name: "fixture", model: "voice-1" }, cost: { currency: "USD", amount: 5 }, outputs: [{ assetId: "voice", path: candidate, sha256: digest }] };
    write(manifest, JSON.stringify(runManifest));
    const args = [root, manifest];
    await authorize("project-admit.mjs", args, sandbox, "admission-session");
    const overBudget = await run("project-admit.mjs", args, { env, sessionId: "admission-session" });
    assert.equal(overBudget.code, 2);
    assert.match(overBudget.stderr, /ADMISSION_BUDGET_EXCEEDED/u);
    runManifest.cost.amount = 1;
    writeFileSync(manifest, JSON.stringify(runManifest));
    await authorize("project-admit.mjs", args, sandbox, "admission-session");

    const result = await run("project-admit.mjs", args, { env, sessionId: "admission-session" });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(existsSync(join(root, "public", "admitted", "voice.wav")), true);
    const evidence = JSON.parse(readFileSync(join(root, "evidence", "admissions", "tts-1.json"), "utf8"));
    assert.equal(evidence.provenance, "declared");
    assert.equal(evidence.outputs[0].digest, digest);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
