#!/usr/bin/env node
// harness-source-hash: sha256:d7eb5c2e7a5ba266f54cb3397eb35423cd022d76328738efc026c1b3670efbc7
import {
  sealTrainingReview
} from "../chunks/chunk-PLOTNDK3.mjs";
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-JAI23ZUJ.mjs";
import {
  assertTrainingProjectRoot,
  atomicWriteJson,
  computeTrainingSubjectDigest,
  loadTrainingProject,
  validateTrainingModel,
  withWriterJournal
} from "../chunks/chunk-OJGCC4JJ.mjs";

// plugins/training-program-design/src/entries/cli/project-review.ts
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
main().catch((error) => {
  process.stderr.write(`[training-program-design:review] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 1;
});
