#!/usr/bin/env node
// harness-source-hash: sha256:09061c60597a3a71066876ab4cca533605a4631510946c82ee81727ef665059a
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-DATLIIJA.mjs";
import {
  assertTrainingProjectRoot,
  atomicWriteJson,
  computeTrainingSubjectDigest,
  createTrainingReceipt,
  loadTrainingProject,
  validateTrainingModel,
  withWriterJournal
} from "../chunks/chunk-IHKARBKI.mjs";

// plugins/training-program-design/src/entries/cli/project-release.ts
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
