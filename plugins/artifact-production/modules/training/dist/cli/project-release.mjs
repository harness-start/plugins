#!/usr/bin/env node
// harness-source-hash: sha256:2dacaf9b88d10a099c4330aa41f0c0f58ac46b041bf30fe0aa69a15b6c96e973
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-B3PNRRNV.mjs";
import {
  assertTrainingProjectRoot,
  atomicWriteJson,
  computeTrainingSubjectDigest,
  createTrainingReceipt,
  loadTrainingProject,
  validateTrainingModel,
  withWriterJournal
} from "../chunks/chunk-3Y67TSGG.mjs";

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
