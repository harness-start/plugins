#!/usr/bin/env node
// harness-source-hash: sha256:e391f0a627a824290ca5a1f81d0d28ec3650ef13a0f78aaa01986be4d569401c
import {
  consumeWriterCapability,
  processWriterArgv
} from "./chunk-UFLAM2JC.mjs";
import {
  assertTrainingProjectRoot,
  atomicWriteJson,
  computeTrainingSubjectDigest,
  createTrainingReceipt,
  loadTrainingProject,
  validateTrainingModel,
  withWriterJournal
} from "./chunk-72PERP4D.mjs";
import "./chunk-QNXKAIVA.mjs";
import "./chunk-YEA2PMNG.mjs";

// plugins/artifact-production/src/domains/training/entries/cli/project-release.ts
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
await main().catch((error) => {
  process.stderr.write(`[training-program-design:release] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 1;
});
