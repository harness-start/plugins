#!/usr/bin/env node
// harness-source-hash: sha256:ccd7fb231793f87ef34f4d17127378fdb4cc6bb7c7de2d6c776759c0dd767bba
import {
  assertTrainingProjectRoot,
  loadTrainingProject,
  validateTrainingModel
} from "./chunk-X4NDUGYQ.mjs";
import "./chunk-NNXJRIQT.mjs";

// plugins/artifact-production/src/domains/training/entries/cli/project-lint.ts
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
await main().catch((error) => {
  process.stderr.write(`[training-program-design:lint] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 1;
});
