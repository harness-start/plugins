#!/usr/bin/env node
// harness-source-hash: sha256:230430fd2f48ea30b2238a97dd35e0ddd2522d1a741868ea1450333d3e33c83b
import {
  consumeWriterCapability,
  processWriterArgv
} from "./chunk-XFZ6O5CW.mjs";
import {
  assertPptxProjectRoot,
  atomicWriteJson,
  sessionMetadata,
  withWriterJournal
} from "./chunk-WD55DXJZ.mjs";
import {
  computePptxSubjectDigest,
  createPptxReceipt,
  createPptxReleaseManifest,
  loadPptxProject,
  validatePptxModel,
  validatePptxReceipt
} from "./chunk-PCGQKVAV.mjs";
import "./chunk-RQQ3DLME.mjs";
import "./chunk-FL36SZ6K.mjs";
import "./chunk-IE4NLJBE.mjs";
import "./chunk-HL4EEBT7.mjs";

// plugins/artifact-production/src/domains/presentation/entries/cli/project-release.ts
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
await main().catch((error) => {
  process.stderr.write(`[pptx-project-release] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
