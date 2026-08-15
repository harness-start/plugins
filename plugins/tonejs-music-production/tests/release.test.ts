import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { computeMusicSubjectDigest } from "../src/lib/contract.js";
import { releaseProject, validateListeningReview } from "../src/lib/release.js";
import { encodePcm16Wav } from "../src/lib/wav.js";

test("releases only a reviewed current mix and writes digest-bound evidence", async () => {
  const parent = await mkdtemp(join(tmpdir(), "tonejs-release-"));
  const root = join(parent, "study");
  await mkdir(root);
  const files = {
    ".gitignore": "node_modules/\n",
    "package.json": "{}\n",
    "package-lock.json": "{}\n",
    "plan.contract.json": JSON.stringify({ schema: "tonejs-music-plan/v1", targetStage: "release" }),
    "music.project.json": JSON.stringify({ schema: "tonejs-music-project/v1", artifactId: "study", sampleRate: 48000, channels: 2, tailSeconds: 1, quality: { maxPeakDbfs: -0.5, minRmsDbfs: -60, maxAbsDcOffset: 0.01, maxClippedSamples: 0 }, tracks: [{ index: 1, id: "lead", role: "melody", instrument: "src/instruments/lead.mjs" }] }),
    "src/composition.mjs": "export default {};\n",
    "src/instruments/lead.mjs": "export function createInstrument() {}\n",
  };
  for (const [filePath, value] of Object.entries(files)) {
    await mkdir(join(root, filePath, ".."), { recursive: true });
    await writeFile(join(root, filePath), value);
  }
  const sourceDigest = computeMusicSubjectDigest({ files });
  const samples = Float32Array.from({ length: 4800 }, (_, index) => 0.1 * Math.sin(index * Math.PI / 24));
  const wav = encodePcm16Wav({ sampleRate: 48000, channels: [samples, samples] });
  await Promise.all([mkdir(join(root, "build")), mkdir(join(root, "proofs")), mkdir(join(root, "review"))]);
  await writeFile(join(root, "build", `score.${sourceDigest}.json`), JSON.stringify({ schema: "tonejs-symbolic-score/v1", sourceDigest }));
  await writeFile(join(root, "build", `metrics.${sourceDigest}.json`), JSON.stringify({ schema: "tonejs-music-metrics/v1", sourceDigest }));
  await writeFile(join(root, "build", `mix.${sourceDigest}.wav`), wav);
  await writeFile(join(root, "proofs", `t001-melody-lead.${sourceDigest}.wav`), wav);
  const renderOutputs = {};
  for (const filePath of [
    `build/score.${sourceDigest}.json`,
    `build/metrics.${sourceDigest}.json`,
    `build/mix.${sourceDigest}.wav`,
    `proofs/t001-melody-lead.${sourceDigest}.wav`,
  ]) renderOutputs[filePath] = createHash("sha256").update(await readFile(join(root, filePath))).digest("hex");
  await writeFile(join(root, "build", `render.${sourceDigest}.json`), JSON.stringify({ schema: "tonejs-render-receipt/v1", sourceDigest, outputs: renderOutputs }));
  const mixSha256 = createHash("sha256").update(wav).digest("hex");
  await writeFile(join(root, "review", "music-review.md"), `# Music review\n\nsourceDigest: ${sourceDigest}\nmixSha256: ${mixSha256}\nmethod: listened\nreviewerKind: independent-agent\nreviewerSession: music-review-session\nfindings: no blocking defect\n`);

  const result = await releaseProject(root);
  const receipt = JSON.parse(await readFile(join(root, "receipt.release.json"), "utf8"));
  const evidence = JSON.parse(await readFile(join(root, "evidence.audio.json"), "utf8"));

  assert.equal(result.sourceDigest, sourceDigest);
  assert.equal(receipt.subjectDigest, sourceDigest);
  assert.equal(evidence.mixSha256, mixSha256);
  assert.equal(evidence.quality.pass, true);
});

test("rejects listening claims without concrete findings", () => {
  const binding = { sourceDigest: "a".repeat(64), mixSha256: "b".repeat(64) };
  assert.equal(validateListeningReview(`sourceDigest: ${binding.sourceDigest}\nmixSha256: ${binding.mixSha256}\nmethod: listened\n`, binding), false);
  assert.equal(validateListeningReview(`sourceDigest: ${binding.sourceDigest}\nmixSha256: ${binding.mixSha256}\nmethod: listened\nreviewerKind: independent-agent\nreviewerSession: music-review-session\nfindings: no blocking defect\n`, binding), true);
  assert.equal(validateListeningReview(`sourceDigest: ${binding.sourceDigest}\nmixSha256: ${binding.mixSha256}\nmethod: listened\nreviewerKind: independent-agent\nreviewerSession: unknown\nfindings: no blocking defect\n`, { ...binding, releaseSessionId: "unknown" }), false);
});
