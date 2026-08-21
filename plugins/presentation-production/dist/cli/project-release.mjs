#!/usr/bin/env node
// harness-source-hash: sha256:b0724e172ed54ddc22873ab472372b1e5d8c9f1fa890f9a1efa0af46d06ed67b
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-GCNTM5U5.mjs";
import {
  assertPptxProjectRoot,
  atomicWriteJson,
  sessionMetadata,
  withWriterJournal
} from "../chunks/chunk-AGPTBFYS.mjs";
import {
  computePptxSubjectDigest,
  createPptxReceipt,
  createPptxReleaseManifest,
  loadPptxProject,
  validatePptxModel,
  validatePptxReceipt
} from "../chunks/chunk-2E6PZALY.mjs";

// plugins/presentation-production/src/entries/cli/project-release.ts
async function main() {
  const root = assertPptxProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "pptx-release", argv: processWriterArgv() });
  let model = await loadPptxProject(root);
  if (grant.subjectDigest !== computePptxSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  const review = JSON.parse(String(model.files?.["review.pptx.json"] ?? "{}"));
  if (review.reviewer?.sessionId === grant.sessionId) throw new Error("SELF_RELEASE_DENIED");
  const before = validatePptxModel(model, { stage: "review" }).filter(({ code, path }) => !["RELEASE_MANIFEST_INVALID", "RECEIPT_INVALID"].includes(code) && !["release.manifest.json", "receipt.release.json"].includes(path));
  if (before.length) throw new Error(before.map(({ code, path }) => `${code}:${path}`).join(", "));
  await withWriterJournal(root, "pptx-release", async () => {
    await atomicWriteJson(root, "release.manifest.json", createPptxReleaseManifest(model));
    model = await loadPptxProject(root);
    const manifestFindings = validatePptxModel(model, { stage: "release" }).filter(({ code, path }) => code !== "MUTATION_JOURNAL_OPEN" && code !== "RECEIPT_INVALID" && path !== "receipt.release.json");
    if (manifestFindings.length) throw new Error(manifestFindings.map(({ code, path }) => `${code}:${path}`).join(", "));
    const receipt = { ...createPptxReceipt(model), ...sessionMetadata("pptx-release", grant) };
    await atomicWriteJson(root, "receipt.release.json", receipt);
    model = await loadPptxProject(root);
    if (!validatePptxReceipt(model)) throw new Error("WRITTEN_RECEIPT_INVALID");
    process.stdout.write(`${JSON.stringify(receipt)}
`);
  }, grant);
}
main().catch((error) => {
  process.stderr.write(`[pptx-project-release] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
