import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { issueMusicWriterCapability } from "../src/lib/capability.js";
import { computeMusicSubjectDigest, musicReviewArtifactPaths } from "../src/lib/contract.js";
import { collectMusicModel } from "../src/lib/release.js";

const ENTRY = fileURLToPath(new URL("../dist/cli/project-review.mjs", import.meta.url));
const sha256 = (value: string | NodeJS.ArrayBufferView) => createHash("sha256").update(value).digest("hex");

async function run(argv: string[]) {
  return new Promise<{ code: number | null; stderr: string }>((resolvePromise, reject) => {
    const child = spawn(process.execPath, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stderr }));
  });
}

test("review writer binds independent coverage and rejects the render session", async () => {
  const parent = await mkdtemp(join(tmpdir(), "music-review-"));
  const root = join(parent, "artifacts", "music", "study");
  const input = join(parent, "review.json");
  await mkdir(join(root, "src", "instruments"), { recursive: true });
  try {
    await writeFile(join(root, "music.project.json"), JSON.stringify({ schema: "music-production/project/v1", artifactId: "study", tracks: [{ index: 1, id: "lead", role: "melody", instrument: "src/instruments/lead.mjs" }] }));
    await writeFile(join(root, "src", "composition.mjs"), "export default {};\n");
    await writeFile(join(root, "src", "instruments", "lead.mjs"), "export function createInstrument() {}\n");
    const subjectDigest = computeMusicSubjectDigest(await collectMusicModel(root));
    const paths = {
      score: `build/score.${subjectDigest}.json`, metrics: `build/metrics.${subjectDigest}.json`, render: `build/render.${subjectDigest}.json`,
      mix: `build/mix.${subjectDigest}.wav`, stem: `proofs/t001-melody-lead.${subjectDigest}.wav`, preview: `evidence/preview.${subjectDigest}.json`,
    };
    await Promise.all([mkdir(join(root, "build")), mkdir(join(root, "proofs")), mkdir(join(root, "evidence"))]);
    await writeFile(join(root, paths.score), JSON.stringify({ schema: "tonejs-symbolic-score/v1", sourceDigest: subjectDigest }));
    await writeFile(join(root, paths.metrics), JSON.stringify({ schema: "tonejs-music-metrics/v1", sourceDigest: subjectDigest }));
    await writeFile(join(root, paths.mix), "RIFF0000WAVE-MIX");
    await writeFile(join(root, paths.stem), "RIFF0000WAVE-STEM");
    await writeFile(join(root, paths.render), JSON.stringify({ schema: "tonejs-render-receipt/v1", sourceDigest: subjectDigest, sessionId: "author-session", outputs: {} }));
    await writeFile(join(root, paths.preview), JSON.stringify({ schema: "music-production/preview/v1", subjectDigest }));
    const model = await collectMusicModel(root);
    const coverage = musicReviewArtifactPaths(model).map((path) => ({ path, sha256: model.digests?.[path] }));
    const checks = ["brief-alignment", "melody-harmony", "rhythm-groove", "form-arrangement", "timbre-orchestration", "balance-space-dynamics", "technical-integrity"].map((id) => ({ id, status: "pass", note: `${id} passes the exact audition.` }));
    const payload = { schema: "music-production/review-input/v1", artifactId: "study", subjectDigest, mixSha256: sha256("RIFF0000WAVE-MIX"), decision: "approved", reviewer: { kind: "independent-agent", id: "reviewer", sessionId: "review-session" }, coverage, checks, findings: [] };
    await writeFile(input, JSON.stringify(payload));
    const argv = [ENTRY, root, input];
    await issueMusicWriterCapability({ root, capability: "music-review", argv, subjectDigest, sessionId: "review-session", triggerFrom: "test" });
    const accepted = await run(argv);
    assert.equal(accepted.code, 0, accepted.stderr);
    const review = JSON.parse(await readFile(join(root, "review.music.json"), "utf8"));
    assert.equal(review.reviewer.sessionId, "review-session");
    assert.equal(review.decision, "approved");

    payload.reviewer.sessionId = "author-session";
    await writeFile(input, JSON.stringify(payload));
    await issueMusicWriterCapability({ root, capability: "music-review", argv, subjectDigest, sessionId: "author-session", triggerFrom: "test" });
    const denied = await run(argv);
    assert.equal(denied.code, 2);
    assert.match(denied.stderr, /SELF_REVIEW_DENIED/u);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
