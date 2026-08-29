import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../../../dist/cli/harness.mjs", import.meta.url));
const HOOK = fileURLToPath(new URL("../../../dist/hooks/dispatcher.mjs", import.meta.url));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function forgedFiles() {
  const visual = "export function Intro() { return <div />; }\n";
  const audio = JSON.stringify({ asset: "public/audio/bed.wav", role: "music", startFrame: 0, endFrame: 10 });
  return {
    ".gitignore": "node_modules/\n",
    "package.json": "{}\n",
    "package-lock.json": "{}\n",
    "plan.contract.json": JSON.stringify({ artifactId: "demo", targetStage: "release" }),
    "plan.storyboard.json": "{}\n",
    "video.project.json": JSON.stringify({ artifactId: "demo", durationInFrames: 10, fps: 30 }),
    "src/index.ts": "",
    "src/Root.tsx": "",
    "src/Video.tsx": "",
    "src/timelines/VisualTimeline.tsx": "",
    "src/timelines/AudioTimeline.tsx": "",
    "src/visual/manifest.json": JSON.stringify({ units: [{ index: 1, id: "intro", startFrame: 0, endFrame: 10, source: "v001-intro.f000000-f000010.tsx" }] }),
    "src/visual/v001-intro.f000000-f000010.tsx": visual,
    [`src/visual/v001-intro.f000000-f000010.${sha256(visual)}.mp4`]: "not an mp4",
    "src/audio/manifest.json": JSON.stringify({ units: [{ index: 1, id: "bed", role: "music", startFrame: 0, endFrame: 10, source: "a001-music-bed.f000000-f000010.audio.json" }] }),
    "src/audio/a001-music-bed.f000000-f000010.audio.json": audio,
    [`src/audio/a001-music-bed.f000000-f000010.${sha256(audio)}.wav`]: "not a wav",
    "public/audio/bed.wav": "not a wav",
    "dist/demo.mp4": "not an mp4",
    "evidence.probe.json": "{}\n",
    "evidence.frames.json": "{}\n",
    "evidence.audio.json": "{}\n",
    "evidence.accessibility.json": "{}\n",
    "review.video.json": "{}\n",
    "release.manifest.json": "{}\n",
  };
}

function run(root) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, "video", "release", root], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function authorize(root, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK, "codex", "PreToolUse"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify({ cwd, session_id: "release-test", tool_name: "Bash", tool_input: { command: `"node" ${JSON.stringify(ENTRY)} video release ${JSON.stringify(root)}` } }));
  });
}

test("release writer rejects forged media and empty evidence", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "video-release-red-"));
  const root = join(sandbox, "artifacts", "video", "demo");
  try {
    for (const [relativePath, content] of Object.entries(forgedFiles())) {
      const target = join(root, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }

    const grant = await authorize(root, sandbox);
    assert.equal(grant.code, 0, grant.stderr);
    assert.equal(grant.stdout.trim(), "", grant.stdout);
    const result = await run(root);

    assert.equal(result.code, 2, result.stdout);
    assert.match(result.stderr, /(?:FINAL_RENDER_PROOF_INVALID|PROBE_EVIDENCE_INVALID)/u);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
