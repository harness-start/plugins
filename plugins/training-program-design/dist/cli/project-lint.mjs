#!/usr/bin/env node
// harness-source-hash: sha256:b65276ea06bc870d1f0c863caa32360f7250a85b91c53b52f68edebc6013186b
import {
  assertTrainingProjectRoot,
  loadTrainingProject,
  validateTrainingModel
} from "../chunks/chunk-ST2HRLKC.mjs";

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
