import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  PACKAGE_SCHEMA,
  PLAN_SCHEMA,
  type TrainingModel,
} from "../../../src/domains/training/lib/contract.js";

export const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

export function validPlan(artifactId = "workflow-foundations", targetStage = "design") {
  return {
    schema: PLAN_SCHEMA,
    artifactId,
    mode: "design",
    targetStage,
    audience: "Operations staff with mixed prior experience",
    objective: "Use the workflow safely in a representative work task",
    durationMinutes: 60,
    modality: "in-person",
    language: "en-US",
    assumptions: [],
  };
}

export function validPackage() {
  return {
    schema: PACKAGE_SCHEMA,
    title: "Workflow Foundations",
    audience: {
      sharedBaseline: "Participants know the business process but not the new workflow.",
      variability: [{ dimension: "tool experience", evidence: "self-reported range from none to weekly use" }],
      diagnostic: "A five-minute common task before instruction",
    },
    outcomes: [{ id: "LO-1", statement: "Complete the representative workflow and explain the safety check.", evidence: "successful task plus explanation" }],
    agenda: [{ id: "S-1", title: "Model and practise", durationMinutes: 60, outcomeIds: ["LO-1"], activityIds: ["A-1"] }],
    activities: [{
      id: "A-1",
      title: "Run the workflow",
      outcomeIds: ["LO-1"],
      commonTask: "Complete the same representative workflow from intake to verification.",
      entrySupports: ["annotated worked example", "vocabulary card"],
      stretchExtensions: ["diagnose a deliberately ambiguous input"],
      facilitatorMoves: ["observe the verification step", "fade the worked example on the second attempt"],
    }],
    assessments: [{ id: "AS-1", outcomeIds: ["LO-1"], method: "performance check", criteria: ["workflow completed", "safety check explained"] }],
    followUp: [{ when: "one week", action: "repeat the task with a live example and record one obstacle" }],
    sources: [],
  };
}

export function sourceModel(artifactId = "workflow-foundations"): TrainingModel {
  const plan = validPlan(artifactId);
  const training = validPackage();
  const files = {
    "plan.contract.json": `${JSON.stringify(plan, null, 2)}\n`,
    "training-package.json": `${JSON.stringify(training, null, 2)}\n`,
  };
  return {
    artifactId,
    root: `/workspace/artifacts/training/${artifactId}`,
    plan,
    training,
    files,
    digests: Object.fromEntries(Object.entries(files).map(([path, value]) => [path, sha256(value)])),
  };
}

export function writeModel(root: string, model: TrainingModel) {
  for (const [relativePath, content] of Object.entries(model.files)) {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}
