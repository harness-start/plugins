#!/usr/bin/env node

import { consumeWriterCapability, processWriterArgv } from "../../lib/capability.js";
import { computeTrainingSubjectDigest, createTrainingReceipt, loadTrainingProject, validateTrainingModel } from "../../lib/contract.js";
import { assertTrainingProjectRoot, atomicWriteJson, withWriterJournal } from "../../lib/writer.js";

async function main() {
  const root = assertTrainingProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "training-release", argv: processWriterArgv() });
  const model = await loadTrainingProject(root);
  if (grant.subjectDigest !== computeTrainingSubjectDigest(model)) throw new Error("WRITER_SUBJECT_STALE");
  const findings = validateTrainingModel(model, { stage: "review" });
  if (findings.length > 0) throw new Error(`REVIEW_INVALID:${findings.map((item) => item.code).join(",")}`);
  const receipt = createTrainingReceipt(model);
  await withWriterJournal(root, "training-release", () => atomicWriteJson(root, "receipt.release.json", receipt), grant);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`[training-program-design:release] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
