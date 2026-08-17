#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { consumeWriterCapability, processWriterArgv } from "../../lib/capability.js";
import { computeTrainingSubjectDigest, loadTrainingProject, validateTrainingModel } from "../../lib/contract.js";
import { sealTrainingReview } from "../../lib/pipeline.js";
import { assertTrainingProjectRoot, atomicWriteJson, withWriterJournal } from "../../lib/writer.js";

async function main() {
  const root = assertTrainingProjectRoot(process.argv[2]);
  const inputPath = resolve(process.argv[3] ?? "");
  const inputRelative = relative(root, inputPath);
  if (!inputRelative || (!inputRelative.startsWith("..") && !isAbsolute(inputRelative))) throw new Error("REVIEW_INPUT_OUTSIDE_PROJECT_REQUIRED");
  const grant = await consumeWriterCapability({ root, capability: "training-review", argv: processWriterArgv() });
  const model = await loadTrainingProject(root);
  if (grant.subjectDigest !== computeTrainingSubjectDigest(model)) throw new Error("WRITER_SUBJECT_STALE");
  const findings = validateTrainingModel(model, { stage: "materials" });
  if (findings.length > 0) throw new Error(`MATERIALS_INVALID:${findings.map((item) => item.code).join(",")}`);
  const input = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
  const review = sealTrainingReview(model, input, grant);
  await withWriterJournal(root, "training-review", () => atomicWriteJson(root, "review.training.json", review), grant);
  process.stdout.write(`${JSON.stringify(review)}\n`);
  if (review.verdict !== "pass") process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`[training-program-design:review] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
