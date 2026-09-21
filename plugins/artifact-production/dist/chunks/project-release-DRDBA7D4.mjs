#!/usr/bin/env node
// harness-source-hash: sha256:5a69b2936e6051b23a45a0fe4c95ae9b70fc60d9e4a2f87fcad9fc09c2802d4a
import {
  consumeWriterCapability,
  processWriterArgv
} from "./chunk-5UAW7T45.mjs";
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
} from "./chunk-OD5VJAOQ.mjs";
import "./chunk-V2UVYWCZ.mjs";
import "./chunk-LNZRBHYO.mjs";
import "./chunk-6TTQXZBL.mjs";
import "./chunk-2VFKL446.mjs";

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
