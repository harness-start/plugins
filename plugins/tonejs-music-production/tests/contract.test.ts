import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  computeMusicSubjectDigest,
  validateMusicModel,
} from "../src/lib/contract.js";

function validModel() {
  const model = {
    artifactId: "four-chord-study",
    files: {
      ".gitignore": "node_modules/\n.cache/\n.tmp/\n",
      "package.json": "{}\n",
      "package-lock.json": "{}\n",
      "plan.contract.json": JSON.stringify({ schema: "tonejs-music-plan/v1", targetStage: "source" }),
      "music.project.json": "{}\n",
      "src/composition.mjs": "export default { schema: 'tonejs-composition/v1' };\n",
      "src/instruments/lead.mjs": "export function createInstrument() {}\n",
    },
    project: {
      schema: "tonejs-music-project/v1",
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
    outputs: Object.fromEntries(outputPaths.map((filePath) => [filePath, createHash("sha256").update(model.files[filePath]).digest("hex")])),
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
  model.files["plan.contract.json"] = JSON.stringify({ schema: "tonejs-music-plan/v1", targetStage: "design" });
  assert.ok(validateMusicModel(model, { stage: "design" }).some(({ code }) => code === "PLAN_STAGE_INVALID"));
});

test("keeps audio identity stable when only the requested closure stage changes", () => {
  const model = validModel();
  const sourceDigest = computeMusicSubjectDigest(model);
  model.files["plan.contract.json"] = JSON.stringify({ schema: "tonejs-music-plan/v1", targetStage: "release" });
  assert.equal(computeMusicSubjectDigest(model), sourceDigest);
});

test("rejects a current-looking mix whose bytes are not bound by the renderer receipt", () => {
  const model = validModel();
  const mixPath = Object.keys(model.files).find((filePath) => filePath.startsWith("build/mix."));
  model.files[mixPath] = "RIFF0000WAVE-FORGED";
  assert.ok(validateMusicModel(model, { stage: "source" }).some(({ code }) => code === "RENDER_RECEIPT_INVALID"));
});
