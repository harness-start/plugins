#!/usr/bin/env node
// harness-source-hash: sha256:aa55e37b578bd1016a6403462a3f72057de2a4fa7baa3013af84343c8e6ab3f1
import {
  sealTrainingReview
} from "./chunk-N6FYI5UJ.mjs";
import {
  consumeWriterCapability,
  processWriterArgv
} from "./chunk-C5ULGZLU.mjs";
import {
  assertTrainingProjectRoot,
  atomicWriteJson,
  computeTrainingSubjectDigest,
  loadTrainingProject,
  validateTrainingModel,
  withWriterJournal
} from "./chunk-5DIPOQPP.mjs";
import "./chunk-XFYUIVLB.mjs";
import "./chunk-64RZK2M5.mjs";

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
