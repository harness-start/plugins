import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { issueMusicWriterCapability } from "../src/lib/capability.js";
import { computeMusicSubjectDigest } from "../src/lib/contract.js";
import { collectMusicModel } from "../src/lib/release.js";

const ENTRY = fileURLToPath(new URL("../dist/cli/project-advice.mjs", import.meta.url));

async function run(argv: string[]) {
  return new Promise<{ code: number | null; stderr: string }>((resolvePromise, reject) => {
    const child = spawn(process.execPath, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stderr }));
  });
}

test("admits only selected pinned external advice bound to the current subject", async () => {
  const parent = await mkdtemp(join(tmpdir(), "music-advice-"));
  const root = join(parent, "artifacts", "music", "study");
  const input = join(parent, "advice.json");
  await mkdir(root, { recursive: true });
  try {
    await writeFile(join(root, "music.project.json"), JSON.stringify({ schema: "music-project-delivery-guard/project/v1", artifactId: "study", tracks: [] }));
    await writeFile(join(root, "plan.skill-composition.json"), JSON.stringify({ schema: "music-project-delivery-guard/skill-composition/v1", artifactId: "study", workers: [
      { name: "music-composition", revision: "07cecf9c8fd15249ea3da311dc9a7c7893ff801f", ecosystem: "en", mode: "adviser", status: "used", reason: "Need form advice.", advicePath: "evidence/skills/music-composition.json" },
      { name: "miaoxiang-music", revision: "1447ff68be4a544a61354377592f345a9216ff1f", ecosystem: "zh", mode: "reference-only", status: "skipped", reason: "Not needed." },
      { name: "workflow-audio-production", revision: "5014c1e8b23fd3e18d49926d9aa147d15a3aa08e", ecosystem: "en", mode: "reference-only", status: "skipped", reason: "Not needed." },
      { name: "workflow-analysis-quality", revision: "5014c1e8b23fd3e18d49926d9aa147d15a3aa08e", ecosystem: "en", mode: "reference-only", status: "skipped", reason: "Reserved for review." },
    ] }));
    const model = await collectMusicModel(root);
    const subjectDigest = computeMusicSubjectDigest(model);
    await writeFile(input, JSON.stringify({ schema: "music-project-delivery-guard/advice-input/v1", artifactId: "study", subjectDigest, skillName: "music-composition", revision: "07cecf9c8fd15249ea3da311dc9a7c7893ff801f", ecosystem: "en", mode: "adviser", phase: "composition", summary: "Strengthen the four-bar question and answer form.", recommendations: ["Reserve the last bar for a response."], adopted: ["Question and answer phrasing."], rejected: ["Longer form exceeds duration."] }));
    const argv = [ENTRY, root, input];
    await issueMusicWriterCapability({ root, capability: "music-advice", argv, subjectDigest, sessionId: "advice-session", triggerFrom: "test" });
    const result = await run(argv);
    assert.equal(result.code, 0, result.stderr);
    const evidence = JSON.parse(await readFile(join(root, "evidence", "skills", "music-composition.json"), "utf8"));
    assert.equal(evidence.subjectDigest, subjectDigest);
    assert.equal(evidence.revision, "07cecf9c8fd15249ea3da311dc9a7c7893ff801f");
    assert.equal(evidence.sessionId, "advice-session");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
