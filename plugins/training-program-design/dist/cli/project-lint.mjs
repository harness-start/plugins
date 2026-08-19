#!/usr/bin/env node
// harness-source-hash: sha256:85b13c2563bdc59fda6a978b54a670ea3995eff826a4b0880d4dd0c0892b9729
import {
  assertTrainingProjectRoot,
  loadTrainingProject,
  validateTrainingModel
} from "../chunks/chunk-WWIPRB2V.mjs";

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
