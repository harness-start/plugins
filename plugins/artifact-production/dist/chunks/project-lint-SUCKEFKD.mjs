#!/usr/bin/env node
// harness-source-hash: sha256:094ae85928967976215355a7d8cc86aa39fa623154b1006d53784ddde5b76db8
import {
  assertTrainingProjectRoot,
  loadTrainingProject,
  validateTrainingModel
} from "./chunk-GG4VJ3T5.mjs";
import "./chunk-QTVEXSL5.mjs";

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
