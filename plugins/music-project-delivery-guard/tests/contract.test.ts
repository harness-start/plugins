import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  computeMusicSubjectDigest,
  musicReviewArtifactPaths,
  validateMusicModel,
  validateMusicReview,
} from "../src/lib/contract.js";

function validModel() {
  const model = {
    artifactId: "four-chord-study",
    files: {
      ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
      "package.json": "{}\n",
      "package-lock.json": "{}\n",
      "plan.contract.json": JSON.stringify({ schema: "music-project-delivery-guard/plan/v1", artifactId: "four-chord-study", targetStage: "source" }),
      "plan.brief.json": JSON.stringify({ schema: "music-project-delivery-guard/brief/v1", artifactId: "four-chord-study", language: "en", audience: "listeners", useCase: "cue", durationSeconds: 8, mood: "bright", genre: "electronic", referenceTraits: ["hook"], structure: ["main"], instrumentation: ["lead"], constraints: ["synth only"], prohibitedDirections: ["copying"], successCriteria: ["clear motif"] }),
      "plan.direction.json": JSON.stringify({ schema: "music-project-delivery-guard/direction/v1", artifactId: "four-chord-study", tonalCenter: "C major", tempo: "120 BPM", meter: "4/4", coreMotif: "triad", soundPalette: ["triangle"], rationale: "Clear tonal cue." }),
      "plan.arrangement.json": JSON.stringify({ schema: "music-project-delivery-guard/arrangement/v1", artifactId: "four-chord-study", sections: [{ id: "main" }], instrumentRoles: [{ id: "lead" }], dynamicsIntent: "steady energy", spaceIntent: "centered lead", mixIntent: "clean headroom" }),
      "plan.skill-composition.json": JSON.stringify({ schema: "music-project-delivery-guard/skill-composition/v1", artifactId: "four-chord-study", workers: [
        { name: "music-composition", revision: "07cecf9c8fd15249ea3da311dc9a7c7893ff801f", ecosystem: "en", mode: "adviser", status: "skipped", reason: "fixture" },
        { name: "miaoxiang-music", revision: "1447ff68be4a544a61354377592f345a9216ff1f", ecosystem: "zh", mode: "reference-only", status: "skipped", reason: "fixture" },
        { name: "workflow-audio-production", revision: "5014c1e8b23fd3e18d49926d9aa147d15a3aa08e", ecosystem: "en", mode: "reference-only", status: "skipped", reason: "fixture" },
        { name: "workflow-analysis-quality", revision: "5014c1e8b23fd3e18d49926d9aa147d15a3aa08e", ecosystem: "en", mode: "reference-only", status: "skipped", reason: "fixture" },
      ] }),
      "music.project.json": "{}\n",
      "src/composition.mjs": "export default { schema: 'tonejs-composition/v1' };\n",
      "src/instruments/lead.mjs": "export function createInstrument() {}\n",
    },
    project: {
      schema: "music-project-delivery-guard/project/v1",
      artifactId: "four-chord-study",
      sampleRate: 48000,
      channels: 2,
      tailSeconds: 1,
      tracks: [
        { index: 1, id: "lead", role: "melody", instrument: "src/instruments/lead.mjs" },
      ],
    },
  };
  const sourceDigest = computeMusicSubjectDigest(model);
  Object.assign(model.files, {
    [`build/score.${sourceDigest}.json`]: JSON.stringify({ schema: "tonejs-symbolic-score/v1", sourceDigest }),
    [`build/metrics.${sourceDigest}.json`]: JSON.stringify({ schema: "tonejs-music-metrics/v1", sourceDigest }),
    [`build/mix.${sourceDigest}.wav`]: "RIFF0000WAVE-MIX",
    [`proofs/t001-melody-lead.${sourceDigest}.wav`]: "RIFF0000WAVE-STEM",
  });
  const outputPaths = [
    `build/score.${sourceDigest}.json`,
    `build/metrics.${sourceDigest}.json`,
    `build/mix.${sourceDigest}.wav`,
    `proofs/t001-melody-lead.${sourceDigest}.wav`,
  ];
  model.files[`build/render.${sourceDigest}.json`] = JSON.stringify({
    schema: "tonejs-render-receipt/v1",
    sourceDigest,
    sessionId: "author-session",
    outputs: Object.fromEntries(outputPaths.map((filePath) => [filePath, createHash("sha256").update(model.files[filePath]).digest("hex")])),
  });
  model.files[`evidence/preview.${sourceDigest}.json`] = JSON.stringify({
    schema: "music-project-delivery-guard/preview/v1",
    subjectDigest: sourceDigest,
    mixSha256: createHash("sha256").update(model.files[`build/mix.${sourceDigest}.wav`]).digest("hex"),
    stems: { [`proofs/t001-melody-lead.${sourceDigest}.wav`]: createHash("sha256").update(model.files[`proofs/t001-melody-lead.${sourceDigest}.wav`]).digest("hex") },
  });
  return model;
}

function approvedReviewModel() {
  const model = validModel();
  const subjectDigest = computeMusicSubjectDigest(model);
  const coverage = musicReviewArtifactPaths(model).map((path) => ({ path, sha256: createHash("sha256").update(model.files[path]).digest("hex") }));
  model.files["review.music.json"] = JSON.stringify({
    schema: "music-project-delivery-guard/review/v1",
    artifactId: model.artifactId,
    subjectDigest,
    decision: "approved",
    reviewer: { kind: "independent-agent", id: "reviewer", sessionId: "review-session" },
    coverage,
    checks: ["brief-alignment", "melody-harmony", "rhythm-groove", "form-arrangement", "timbre-orchestration", "balance-space-dynamics", "technical-integrity"].map((id) => ({ id, status: "pass", note: `${id} passes current evidence.` })),
    findings: [],
  });
  return model;
}

test("accepts source artifacts bound to the current mathematical composition digest", () => {
  assert.deepEqual(validateMusicModel(validModel(), { stage: "source" }), []);
});

test("lints design sources before generated artifacts exist", () => {
  const model = validModel();
  for (const filePath of Object.keys(model.files)) {
    if (/^(?:build|proofs)\//u.test(filePath)) delete model.files[filePath];
  }
  assert.deepEqual(validateMusicModel(model, { stage: "design" }), []);
});

test("rejects a plan that tries to escape closure through the internal design stage", () => {
  const model = validModel();
  model.files["plan.contract.json"] = JSON.stringify({ schema: "music-project-delivery-guard/plan/v1", artifactId: "four-chord-study", targetStage: "design" });
  assert.ok(validateMusicModel(model, { stage: "design" }).some(({ code }) => code === "PLAN_STAGE_INVALID"));
});

test("rejects a plan bound to a different artifact directory", () => {
  const model = validModel();
  model.files["plan.contract.json"] = JSON.stringify({ schema: "music-project-delivery-guard/plan/v1", artifactId: "other-study", targetStage: "source" });
  assert.ok(validateMusicModel(model, { stage: "design" }).some(({ code }) => code === "PLAN_ARTIFACT_MISMATCH"));
});

test("keeps audio identity stable when only the requested closure stage changes", () => {
  const model = validModel();
  const sourceDigest = computeMusicSubjectDigest(model);
  model.files["plan.contract.json"] = JSON.stringify({ schema: "music-project-delivery-guard/plan/v1", artifactId: "four-chord-study", targetStage: "release" });
  assert.equal(computeMusicSubjectDigest(model), sourceDigest);
});

test("rejects a current-looking mix whose bytes are not bound by the renderer receipt", () => {
  const model = validModel();
  const mixPath = Object.keys(model.files).find((filePath) => filePath.startsWith("build/mix."));
  model.files[mixPath] = "RIFF0000WAVE-FORGED";
  assert.ok(validateMusicModel(model, { stage: "source" }).some(({ code }) => code === "RENDER_RECEIPT_INVALID"));
});

test("accepts only current independently reviewed artifacts", () => {
  const model = approvedReviewModel();
  assert.deepEqual(validateMusicReview(model, { requireApproved: true }), []);
  const review = JSON.parse(model.files["review.music.json"]);
  review.reviewer.sessionId = "author-session";
  model.files["review.music.json"] = JSON.stringify(review);
  assert.ok(validateMusicReview(model, { requireApproved: true }).some(({ code }) => code === "REVIEW_SELF"));
});

test("invalidates review coverage when a rendered artifact changes", () => {
  const model = approvedReviewModel();
  const mixPath = Object.keys(model.files).find((path) => path.startsWith("build/mix."));
  model.files[mixPath] = "RIFF0000WAVE-CHANGED";
  assert.ok(validateMusicReview(model, { requireApproved: true }).some(({ code }) => code === "REVIEW_COVERAGE_INVALID"));
});
