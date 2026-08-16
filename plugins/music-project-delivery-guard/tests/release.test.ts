import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { computeMusicSubjectDigest, musicReviewArtifactPaths } from "../src/lib/contract.js";
import { collectMusicModel, releaseProject, validateListeningReview } from "../src/lib/release.js";
import { encodePcm16Wav } from "../src/lib/wav.js";

const sha256 = (value: string | NodeJS.ArrayBufferView) => createHash("sha256").update(value).digest("hex");
const checks = ["brief-alignment", "melody-harmony", "rhythm-groove", "form-arrangement", "timbre-orchestration", "balance-space-dynamics", "technical-integrity"]
  .map((id) => ({ id, status: "pass", note: `${id} satisfies the declared brief.` }));

test("releases only a reviewed current mix and writes digest-bound evidence", async () => {
  const parent = await mkdtemp(join(tmpdir(), "music-release-"));
  const root = join(parent, "artifacts", "music", "study");
  await mkdir(root, { recursive: true });
  const files = {
    ".gitignore": "node_modules/\n",
    "package.json": "{}\n",
    "package-lock.json": "{}\n",
    "plan.contract.json": JSON.stringify({ schema: "music-project-delivery-guard/plan/v1", artifactId: "study", targetStage: "release" }),
    "plan.brief.json": JSON.stringify({ schema: "music-project-delivery-guard/brief/v1", artifactId: "study", language: "en", audience: "listeners", useCase: "cue", durationSeconds: 8, mood: "bright", genre: "electronic", referenceTraits: ["hook"], structure: ["main"], instrumentation: ["lead"], constraints: ["synth only"], prohibitedDirections: ["copying"], successCriteria: ["clear motif"] }),
    "plan.direction.json": JSON.stringify({ schema: "music-project-delivery-guard/direction/v1", artifactId: "study", tonalCenter: "C major", tempo: "120 BPM", meter: "4/4", coreMotif: "triad", soundPalette: ["triangle"], rationale: "Clear tonal cue." }),
    "plan.arrangement.json": JSON.stringify({ schema: "music-project-delivery-guard/arrangement/v1", artifactId: "study", sections: [{ id: "main" }], instrumentRoles: [{ id: "lead" }], dynamicsIntent: "steady energy", spaceIntent: "centered lead", mixIntent: "clean headroom" }),
    "plan.skill-composition.json": JSON.stringify({ schema: "music-project-delivery-guard/skill-composition/v1", artifactId: "study", workers: [
      { name: "music-composition", revision: "07cecf9c8fd15249ea3da311dc9a7c7893ff801f", ecosystem: "en", mode: "adviser", status: "skipped", reason: "fixture" },
      { name: "miaoxiang-music", revision: "1447ff68be4a544a61354377592f345a9216ff1f", ecosystem: "zh", mode: "reference-only", status: "skipped", reason: "fixture" },
      { name: "workflow-audio-production", revision: "5014c1e8b23fd3e18d49926d9aa147d15a3aa08e", ecosystem: "en", mode: "reference-only", status: "skipped", reason: "fixture" },
      { name: "workflow-analysis-quality", revision: "5014c1e8b23fd3e18d49926d9aa147d15a3aa08e", ecosystem: "en", mode: "reference-only", status: "skipped", reason: "fixture" },
    ] }),
    "music.project.json": JSON.stringify({ schema: "music-project-delivery-guard/project/v1", artifactId: "study", sampleRate: 48000, channels: 2, tailSeconds: 1, quality: { maxPeakDbfs: -0.5, minRmsDbfs: -60, maxAbsDcOffset: 0.01, maxClippedSamples: 0 }, tracks: [{ index: 1, id: "lead", role: "melody", instrument: "src/instruments/lead.mjs" }] }),
    "src/composition.mjs": "export default {};\n",
    "src/instruments/lead.mjs": "export function createInstrument() {}\n",
  };
  for (const [filePath, value] of Object.entries(files)) {
    await mkdir(join(root, filePath, ".."), { recursive: true });
    await writeFile(join(root, filePath), value);
  }
  const sourceDigest = computeMusicSubjectDigest({ artifactId: "study", files });
  const samples = Float32Array.from({ length: 4800 }, (_, index) => 0.1 * Math.sin(index * Math.PI / 24));
  const wav = encodePcm16Wav({ sampleRate: 48000, channels: [samples, samples] });
  await Promise.all([mkdir(join(root, "build")), mkdir(join(root, "proofs")), mkdir(join(root, "evidence"))]);
  const scorePath = `build/score.${sourceDigest}.json`;
  const metricsPath = `build/metrics.${sourceDigest}.json`;
  const mixPath = `build/mix.${sourceDigest}.wav`;
  const stemPath = `proofs/t001-melody-lead.${sourceDigest}.wav`;
  const renderPath = `build/render.${sourceDigest}.json`;
  const previewPath = `evidence/preview.${sourceDigest}.json`;
  await writeFile(join(root, scorePath), JSON.stringify({ schema: "tonejs-symbolic-score/v1", sourceDigest }));
  await writeFile(join(root, metricsPath), JSON.stringify({ schema: "tonejs-music-metrics/v1", sourceDigest }));
  await writeFile(join(root, mixPath), wav);
  await writeFile(join(root, stemPath), wav);
  const renderOutputs: Record<string, string> = {};
  for (const filePath of [scorePath, metricsPath, mixPath, stemPath]) renderOutputs[filePath] = sha256(await readFile(join(root, filePath)));
  await writeFile(join(root, renderPath), JSON.stringify({ schema: "tonejs-render-receipt/v1", sourceDigest, sessionId: "author-session", outputs: renderOutputs }));
  await writeFile(join(root, previewPath), JSON.stringify({ schema: "music-project-delivery-guard/preview/v1", subjectDigest: sourceDigest, mixSha256: sha256(wav), stems: { [stemPath]: sha256(wav) } }));
  const beforeReview = await collectMusicModel(root);
  const coverage = musicReviewArtifactPaths(beforeReview).map((path) => ({ path, sha256: beforeReview.digests?.[path] }));
  const review = { schema: "music-project-delivery-guard/review/v1", plugin: "music-project-delivery-guard", artifactId: "study", subjectDigest: sourceDigest, mixSha256: sha256(wav), decision: "approved", reviewer: { kind: "independent-agent", id: "reviewer", sessionId: "review-session" }, coverage, checks, findings: [] };
  await writeFile(join(root, "review.music.json"), `${JSON.stringify(review, null, 2)}\n`);

  const result = await releaseProject(root);
  const receipt = JSON.parse(await readFile(join(root, "receipt.release.json"), "utf8"));
  const evidence = JSON.parse(await readFile(join(root, "evidence.audio.json"), "utf8"));
  assert.equal(result.sourceDigest, sourceDigest);
  assert.equal(receipt.subjectDigest, sourceDigest);
  assert.equal(evidence.mixSha256, sha256(wav));
  assert.equal(evidence.quality.pass, true);
  assert.ok(evidence.stems[stemPath]);
});

test("accepts only a structured approved review bound to the current mix", () => {
  const binding = { sourceDigest: "a".repeat(64), mixSha256: "b".repeat(64) };
  assert.equal(validateListeningReview("method: listened", binding), false);
  assert.equal(validateListeningReview({ schema: "music-project-delivery-guard/review/v1", decision: "changes_requested", subjectDigest: binding.sourceDigest, mixSha256: binding.mixSha256 }, binding), false);
  assert.equal(validateListeningReview({ schema: "music-project-delivery-guard/review/v1", decision: "approved", subjectDigest: binding.sourceDigest, mixSha256: binding.mixSha256 }, binding), true);
});
