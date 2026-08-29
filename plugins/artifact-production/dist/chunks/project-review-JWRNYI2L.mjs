#!/usr/bin/env node
// harness-source-hash: sha256:0c811d66170e751d4c95f49bfca01deb84cbe9025b35ec552ae2ab9dd9de90a7
import {
  sealTrainingReview
} from "./chunk-YBAWVTLH.mjs";
import {
  consumeWriterCapability,
  processWriterArgv
} from "./chunk-6U6Z5RHF.mjs";
import {
  assertTrainingProjectRoot,
  atomicWriteJson,
  computeTrainingSubjectDigest,
  loadTrainingProject,
  validateTrainingModel,
  withWriterJournal
} from "./chunk-EIRXSPYF.mjs";
import "./chunk-WSR4DPVF.mjs";
import "./chunk-4DTUINPK.mjs";

// plugins/artifact-production/src/domains/training/entries/cli/project-review.ts
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
async function main() {
  const root = assertTrainingProjectRoot(process.argv[2]);
  const inputPath = resolve(process.argv[3] ?? "");
  const inputRelative = relative(root, inputPath);
  if (!inputRelative || !inputRelative.startsWith("..") && !isAbsolute(inputRelative)) throw new Error("REVIEW_INPUT_OUTSIDE_PROJECT_REQUIRED");
  const grant = await consumeWriterCapability({ root, capability: "training-review", argv: processWriterArgv() });
  const model = await loadTrainingProject(root);
  if (grant.subjectDigest !== computeTrainingSubjectDigest(model)) throw new Error("WRITER_SUBJECT_STALE");
  const findings = validateTrainingModel(model, { stage: "materials" });
  if (findings.length > 0) throw new Error(`MATERIALS_INVALID:${findings.map((item) => item.code).join(",")}`);
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const review = sealTrainingReview(model, input, grant);
  await withWriterJournal(root, "training-review", () => atomicWriteJson(root, "review.training.json", review), grant);
  process.stdout.write(`${JSON.stringify(review)}
`);
  if (review.verdict !== "pass") process.exitCode = 1;
}
await main().catch((error) => {
  process.stderr.write(`[training-program-design:review] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 1;
});
