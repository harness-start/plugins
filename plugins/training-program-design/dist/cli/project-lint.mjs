#!/usr/bin/env node
// harness-source-hash: sha256:b2f36386157c00b16ab52a11758d9a35c1698d230797b5e0e14009bbe921c99a
import {
  assertTrainingProjectRoot,
  loadTrainingProject,
  validateTrainingModel
} from "../chunks/chunk-GMK6D3DB.mjs";

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
