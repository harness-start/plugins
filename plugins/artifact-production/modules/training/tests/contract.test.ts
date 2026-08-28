import assert from "node:assert/strict";
import test from "node:test";

import {
  computeTrainingSubjectDigest,
  evaluateTrainingWrite,
  validateTrainingModel,
} from "../src/lib/contract.js";
import { sourceModel, validPackage, validPlan } from "./fixture.js";

test("accepts a complete design-stage training contract", () => {
  assert.deepEqual(validateTrainingModel(sourceModel(), { stage: "design" }), []);
});

test("rejects agenda duration drift and unresolved outcome mappings", () => {
  const model = sourceModel();
  model.training = validPackage();
  model.training.agenda[0].durationMinutes = 45;
  model.training.activities[0].outcomeIds = ["LO-missing"];

  const codes = validateTrainingModel(model, { stage: "design" }).map(({ code }) => code);
  assert.ok(codes.includes("AGENDA_DURATION_MISMATCH"));
  assert.ok(codes.includes("OUTCOME_REFERENCE_INVALID"));
});

test("rejects unsupported audience claims and agenda blocks that do not schedule their outcomes", () => {
  const model = sourceModel();
  model.training = validPackage();
  model.training.audience.variability = [{ dimension: "experience", evidence: "" }];
  model.training.agenda[0].outcomeIds = ["LO-1"];
  model.training.agenda[0].activityIds = ["A-2"];
  model.training.activities.push({
    id: "A-2",
    title: "Unrelated activity",
    outcomeIds: ["LO-2"],
    commonTask: "Perform an unrelated task",
    entrySupports: ["example"],
    stretchExtensions: ["edge case"],
    facilitatorMoves: ["observe"],
  });
  model.training.outcomes.push({ id: "LO-2", statement: "Complete a second task", evidence: "successful result" });
  model.training.assessments.push({ id: "AS-2", outcomeIds: ["LO-2"], method: "performance check", criteria: ["completed"] });

  const codes = validateTrainingModel(model, { stage: "design" }).map(({ code }) => code);
  assert.ok(codes.includes("AUDIENCE_VARIABILITY_INVALID"));
  assert.ok(codes.includes("AGENDA_ACTIVITY_OUTCOME_MISMATCH"));
});

test("requires adaptation trace only in adapt mode", () => {
  const model = sourceModel();
  model.plan = { ...validPlan(), mode: "adapt" };

  assert.ok(validateTrainingModel(model, { stage: "design" }).some(({ code }) => code === "ADAPTATION_TRACE_REQUIRED"));
  model.training = { ...validPackage(), adaptationTrace: [{ source: "legacy module 1", action: "retain", reason: "still supports LO-1" }] };
  assert.equal(validateTrainingModel(model, { stage: "design" }).some(({ code }) => code === "ADAPTATION_TRACE_REQUIRED"), false);
});

test("preserves a stable subject digest and changes it after source mutation", () => {
  const model = sourceModel();
  const before = computeTrainingSubjectDigest(model);
  model.training.title = "Changed title";
  const after = computeTrainingSubjectDigest(model);

  assert.match(before, /^[a-f0-9]{64}$/u);
  assert.notEqual(after, before);
});

test("protects generated paths but leaves source contracts editable", () => {
  assert.equal(evaluateTrainingWrite({ relativePath: "artifacts/training/demo/training-package.json", toolName: "Write" }).decision, "allow");
  const generated = evaluateTrainingWrite({ relativePath: "artifacts/training/demo/dist/facilitator-guide.md", toolName: "Write" });
  assert.equal(generated.decision, "deny");
  assert.equal(generated.code, "PROTECTED_WRITER_REQUIRED");
});

test("rejects unknown validation stages", () => {
  assert.deepEqual(validateTrainingModel(sourceModel(), { stage: "done" }).map(({ code }) => code), ["STAGE_INVALID"]);
});
