#!/usr/bin/env node

import { loadTrainingProject, validateTrainingModel } from "../../lib/contract.js";
import { assertTrainingProjectRoot } from "../../lib/writer.js";

async function main() {
  const root = assertTrainingProjectRoot(process.argv[2]);
  const model = await loadTrainingProject(root);
  const stageIndex = process.argv.indexOf("--stage");
  const stage = stageIndex >= 0 ? process.argv[stageIndex + 1] : model.plan?.targetStage ?? "brief";
  const findings = validateTrainingModel(model, { stage });
  process.stdout.write(`${JSON.stringify({ plugin: "training-program-design", artifactId: model.artifactId, stage, verdict: findings.length === 0 ? "pass" : "fail", findings }, null, 2)}\n`);
  if (findings.length > 0) process.exitCode = 1;
}

await main().catch((error: unknown) => {
  process.stderr.write(`[training-program-design:lint] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
