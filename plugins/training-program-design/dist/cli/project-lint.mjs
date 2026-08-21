#!/usr/bin/env node
// harness-source-hash: sha256:c85b196267a83ba52e01dca5250ee4aaf53f83d91563581a5ff1aae595eeb57c
import {
  assertTrainingProjectRoot,
  loadTrainingProject,
  validateTrainingModel
} from "../chunks/chunk-AFVNRVDR.mjs";

// plugins/training-program-design/src/entries/cli/project-lint.ts
async function main() {
  const root = assertTrainingProjectRoot(process.argv[2]);
  const model = await loadTrainingProject(root);
  const stageIndex = process.argv.indexOf("--stage");
  const stage = stageIndex >= 0 ? process.argv[stageIndex + 1] : model.plan?.targetStage ?? "brief";
  const findings = validateTrainingModel(model, { stage });
  process.stdout.write(`${JSON.stringify({ plugin: "training-program-design", artifactId: model.artifactId, stage, verdict: findings.length === 0 ? "pass" : "fail", findings }, null, 2)}
`);
  if (findings.length > 0) process.exitCode = 1;
}
main().catch((error) => {
  process.stderr.write(`[training-program-design:lint] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 1;
});
