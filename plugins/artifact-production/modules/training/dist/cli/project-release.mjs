#!/usr/bin/env node
// harness-source-hash: sha256:ef695d6fd2eb6e7e4a94f216f9124f5bcfe57ab9a48536ec76395ea740d53b97
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-MIO5P3HT.mjs";
import {
  assertTrainingProjectRoot,
  atomicWriteJson,
  computeTrainingSubjectDigest,
  createTrainingReceipt,
  loadTrainingProject,
  validateTrainingModel,
  withWriterJournal
} from "../chunks/chunk-IU63PVFW.mjs";

// plugins/artifact-production/modules/training/src/entries/cli/project-release.ts
async function main() {
  const root = assertTrainingProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "training-release", argv: processWriterArgv() });
  const model = await loadTrainingProject(root);
  if (grant.subjectDigest !== computeTrainingSubjectDigest(model)) throw new Error("WRITER_SUBJECT_STALE");
  const findings = validateTrainingModel(model, { stage: "review" });
  if (findings.length > 0) throw new Error(`REVIEW_INVALID:${findings.map((item) => item.code).join(",")}`);
  const receipt = createTrainingReceipt(model);
  await withWriterJournal(root, "training-release", () => atomicWriteJson(root, "receipt.release.json", receipt), grant);
  process.stdout.write(`${JSON.stringify(receipt)}
`);
}
main().catch((error) => {
  process.stderr.write(`[training-program-design:release] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 1;
});
