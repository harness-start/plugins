import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  computeMusicSubjectDigest,
  musicBriefSha256,
  musicReferenceProfilePath,
  musicReviewArtifactPaths,
  musicSourcePaths,
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
      "plan.contract.json": JSON.stringify({ schema: "music-production/plan/v1", artifactId: "four-chord-study", targetStage: "source" }),
      "plan.brief.json": JSON.stringify({ schema: "music-production/brief/v1", artifactId: "four-chord-study", language: "en", audience: "listeners", useCase: "cue", durationSeconds: 8, mood: "bright", genre: "electronic", referenceTraits: ["hook"], structure: ["main"], instrumentation: ["lead"], constraints: ["synth only"], prohibitedDirections: ["copying"], successCriteria: ["clear motif"] }),
      "plan.direction.json": JSON.stringify({ schema: "music-production/direction/v1", artifactId: "four-chord-study", tonalCenter: "C major", tempo: "120 BPM", meter: "4/4", coreMotif: "triad", soundPalette: ["triangle"], rationale: "Clear tonal cue." }),
      "plan.arrangement.json": JSON.stringify({ schema: "music-production/arrangement/v1", artifactId: "four-chord-study", sections: [{ id: "main" }], instrumentRoles: [{ id: "lead" }], dynamicsIntent: "steady energy", spaceIntent: "centered lead", mixIntent: "clean headroom" }),
      "plan.skill-composition.json": JSON.stringify({ schema: "music-production/skill-composition/v1", artifactId: "four-chord-study", workers: [
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
      schema: "music-production/project/v1",
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
    schema: "music-production/preview/v1",
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
    schema: "music-production/review/v1",
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

function referenceDesignModel() {
  const model = validModel();
  for (const filePath of Object.keys(model.files)) {
    if (/^(?:build|proofs|evidence)\//u.test(filePath)) delete model.files[filePath];
  }
  model.files["plan.brief.json"] = JSON.stringify({
    schema: "music-production/brief/v2",
    artifactId: model.artifactId,
    language: "en",
    audience: "listeners",
    useCase: "cue",
    durationSeconds: 8,
    mood: "bright",
    genre: "electronic",
    reference: { mode: "source-analysis", sourceSetSha256: "a".repeat(64) },
    referenceTraits: [],
    structure: ["main"],
    instrumentation: ["lead"],
    constraints: ["synth only"],
    prohibitedDirections: ["copying"],
    successCriteria: ["clear motif"],
  });
  const profilePath = musicReferenceProfilePath(model);
  model.files["plan.skill-composition.json"] = JSON.stringify({
    schema: "music-production/skill-composition/v2",
    artifactId: model.artifactId,
    workers: [
      { name: "music-composition", revision: "07cecf9c8fd15249ea3da311dc9a7c7893ff801f", ecosystem: "en", mode: "adviser", artifactKind: "advice", status: "skipped", reason: "fixture" },
      { name: "miaoxiang-music", revision: "1447ff68be4a544a61354377592f345a9216ff1f", ecosystem: "zh", mode: "reference-only", artifactKind: "advice", status: "skipped", reason: "fixture" },
      { name: "musical-dna", revision: "e02ec7e226a6e4f8419fd3b88a1d8e472d421b32", ecosystem: "en", mode: "reference-only", artifactKind: "reference-profile", status: "used", reason: "source analysis", evidencePath: profilePath },
      { name: "workflow-audio-production", revision: "5014c1e8b23fd3e18d49926d9aa147d15a3aa08e", ecosystem: "en", mode: "reference-only", artifactKind: "advice", status: "skipped", reason: "fixture" },
      { name: "workflow-analysis-quality", revision: "5014c1e8b23fd3e18d49926d9aa147d15a3aa08e", ecosystem: "en", mode: "reference-only", artifactKind: "advice", status: "skipped", reason: "fixture" },
    ],
  });
  const trait = [{ trait: "syncopated pulse", basis: "observed", referenceIds: ["r1"] }];
  model.files[profilePath] = JSON.stringify({
    schema: "music-production/reference-profile/v1",
    plugin: "music-production",
    artifactId: model.artifactId,
    briefSha256: musicBriefSha256(model),
    sourceSetSha256: "a".repeat(64),
    referenceCount: 3,
    skillName: "musical-dna",
    revision: "e02ec7e226a6e4f8419fd3b88a1d8e472d421b32",
    ecosystem: "en",
    mode: "reference-only",
    phase: "reference-analysis",
    dimensions: { rhythmicFoundation: trait, harmonicArchitecture: trait, instrumentalTechniques: trait, productionAesthetics: trait, genreFusion: trait, energyArchitecture: trait },
    descriptors: ["syncopated pulse", "slow harmony", "short attacks", "dry center", "energy lift"],
    toneJsMapping: { rhythmAndTempo: ["syncopation"], harmonyAndVoicing: ["close voices"], timbreAndEffects: ["short envelope"], spaceAndDynamics: ["dry center"], formAndEnergy: ["final lift"] },
    unsupportedTraits: [],
    antiImitation: { artistNamesRemoved: true, signatureMaterialExcluded: true, imitationPromptExcluded: true },
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
  model.files["plan.contract.json"] = JSON.stringify({ schema: "music-production/plan/v1", artifactId: "four-chord-study", targetStage: "design" });
  assert.ok(validateMusicModel(model, { stage: "design" }).some(({ code }) => code === "PLAN_STAGE_INVALID"));
});

test("rejects a plan bound to a different artifact directory", () => {
  const model = validModel();
  model.files["plan.contract.json"] = JSON.stringify({ schema: "music-production/plan/v1", artifactId: "other-study", targetStage: "source" });
  assert.ok(validateMusicModel(model, { stage: "design" }).some(({ code }) => code === "PLAN_ARTIFACT_MISMATCH"));
});

test("keeps audio identity stable when only the requested closure stage changes", () => {
  const model = validModel();
  const sourceDigest = computeMusicSubjectDigest(model);
  model.files["plan.contract.json"] = JSON.stringify({ schema: "music-production/plan/v1", artifactId: "four-chord-study", targetStage: "release" });
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

test("requires a current anonymous reference profile for source-analysis design", () => {
  const model = referenceDesignModel();
  const profilePath = musicReferenceProfilePath(model);
  assert.deepEqual(validateMusicModel(model, { stage: "design" }), []);
  assert.equal(musicReviewArtifactPaths(model).at(-1), profilePath);
  model.files["plan.brief.json"] = model.files["plan.brief.json"].replace('"bright"', '"dark"');
  assert.ok(validateMusicModel(model, { stage: "design" }).some(({ code }) => code === "REFERENCE_PROFILE_INVALID" || code === "REQUIRED_PATH_MISSING"));
});

test("requires reference-profile-alignment in a source-analysis review", () => {
  const model = referenceDesignModel();
  const artifactPaths = musicReviewArtifactPaths(model);
  const renderPath = musicSourcePaths(model).renderReceipt;
  for (const path of artifactPaths) model.files[path] ??= "{}";
  model.files[renderPath] = JSON.stringify({ sessionId: "author-session" });
  const coverage = artifactPaths.map((path) => ({ path, sha256: createHash("sha256").update(model.files[path]).digest("hex") }));
  const checks = ["brief-alignment", "melody-harmony", "rhythm-groove", "form-arrangement", "timbre-orchestration", "balance-space-dynamics", "technical-integrity"].map((id) => ({ id, status: "pass", note: `${id} passes current evidence.` }));
  model.files["review.music.json"] = JSON.stringify({ schema: "music-production/review/v2", artifactId: model.artifactId, subjectDigest: computeMusicSubjectDigest(model), decision: "approved", reviewer: { kind: "independent-agent", id: "reviewer", sessionId: "review-session" }, coverage, checks, findings: [] });
  assert.ok(validateMusicReview(model, { requireApproved: true }).some(({ code }) => code === "REVIEW_CHECKS_INCOMPLETE"));
  checks.push({ id: "reference-profile-alignment", status: "pass", note: "Anonymous traits are audible without signature copying." });
  model.files["review.music.json"] = JSON.stringify({ ...JSON.parse(model.files["review.music.json"]), checks });
  assert.equal(validateMusicReview(model, { requireApproved: true }).some(({ code }) => code === "REVIEW_CHECKS_INCOMPLETE"), false);
});
