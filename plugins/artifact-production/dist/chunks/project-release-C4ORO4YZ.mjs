#!/usr/bin/env node
// harness-source-hash: sha256:230430fd2f48ea30b2238a97dd35e0ddd2522d1a741868ea1450333d3e33c83b
import {
  consumeWriterCapability,
  processWriterArgv
} from "./chunk-ETDDZHSX.mjs";
import {
  assertPosterProjectRoot,
  atomicWriteJson,
  computePosterSubjectDigest,
  createPosterReceipt,
  createPosterReleaseManifest,
  loadPosterProject,
  sessionMetadata,
  validatePosterModel,
  validatePosterReceipt,
  withWriterJournal
} from "./chunk-44QHQQLV.mjs";
import "./chunk-FL36SZ6K.mjs";
import "./chunk-IE4NLJBE.mjs";
import "./chunk-HL4EEBT7.mjs";

// plugins/artifact-production/src/domains/poster/entries/cli/project-release.ts
async function main() {
  const root = assertPosterProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "poster-release", argv: processWriterArgv() });
  let model = await loadPosterProject(root);
  if (grant.subjectDigest !== computePosterSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  const review = JSON.parse(String(model.files?.["review.poster.json"] ?? "{}"));
  if (review.reviewer?.sessionId === grant.sessionId) throw new Error("SELF_RELEASE_DENIED");
  const before = validatePosterModel(model, { stage: "review" }).filter(({ code, path }) => !["RELEASE_MANIFEST_INVALID", "RECEIPT_INVALID"].includes(code) && !["release.manifest.json", "receipt.release.json"].includes(path));
  if (before.length) throw new Error(before.map(({ code, path }) => `${code}:${path}`).join(", "));
  await withWriterJournal(root, "poster-release", async () => {
    await atomicWriteJson(root, "release.manifest.json", createPosterReleaseManifest(model));
    model = await loadPosterProject(root);
    const manifestFindings = validatePosterModel(model, { stage: "release" }).filter(({ code, path }) => code !== "MUTATION_JOURNAL_OPEN" && code !== "RECEIPT_INVALID" && path !== "receipt.release.json");
    if (manifestFindings.length) throw new Error(manifestFindings.map(({ code, path }) => `${code}:${path}`).join(", "));
    const receipt = { ...createPosterReceipt(model), ...sessionMetadata("poster-release", grant) };
    await atomicWriteJson(root, "receipt.release.json", receipt);
    model = await loadPosterProject(root);
    if (!validatePosterReceipt(model)) throw new Error("WRITTEN_RECEIPT_INVALID");
    process.stdout.write(`${JSON.stringify(receipt)}
`);
  }, grant);
}
await main().catch((error) => {
  process.stderr.write(`[poster-project-release] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
