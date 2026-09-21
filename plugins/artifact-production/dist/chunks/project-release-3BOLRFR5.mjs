#!/usr/bin/env node
// harness-source-hash: sha256:5a69b2936e6051b23a45a0fe4c95ae9b70fc60d9e4a2f87fcad9fc09c2802d4a
import {
  consumeWriterCapability,
  processWriterArgv
} from "./chunk-P2EESWJL.mjs";
import "./chunk-LNZRBHYO.mjs";
import {
  assertDiagramProjectRoot,
  atomicWriteJson,
  computeDiagramSubjectDigest,
  createDiagramReceipt,
  createDiagramReleaseManifest,
  loadDiagramProject,
  sessionMetadata,
  validateDiagramModel,
  validateDiagramReceipt,
  withWriterJournal
} from "./chunk-FKPEEOQC.mjs";
import "./chunk-6TTQXZBL.mjs";
import "./chunk-2VFKL446.mjs";

// plugins/artifact-production/src/domains/diagram/entries/cli/project-release.ts
async function main() {
  const root = assertDiagramProjectRoot(process.argv[2]);
  let model = await loadDiagramProject(root);
  const grant = await consumeWriterCapability({ root, capability: "diagram-release", argv: processWriterArgv() });
  if (grant.subjectDigest !== computeDiagramSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  const review = JSON.parse(String(model.files?.["review.diagram.json"] ?? "{}"));
  if (review.reviewer?.sessionId === grant.sessionId) throw new Error("SELF_RELEASE_DENIED");
  const before = validateDiagramModel(model, { stage: "review" }).filter(({ code, path }) => !["RELEASE_MANIFEST_INVALID", "RECEIPT_INVALID"].includes(code) && !["release.manifest.json", "receipt.release.json"].includes(path));
  if (before.length) throw new Error(before.map(({ code, path }) => `${code}:${path}`).join(", "));
  await withWriterJournal(root, "diagram-release", async () => {
    await atomicWriteJson(root, "release.manifest.json", createDiagramReleaseManifest(model));
    model = await loadDiagramProject(root);
    const manifestFindings = validateDiagramModel(model, { stage: "release" }).filter(({ code }) => !["MUTATION_JOURNAL_OPEN", "RECEIPT_INVALID"].includes(code));
    if (manifestFindings.length) throw new Error(manifestFindings.map(({ code, path }) => `${code}:${path}`).join(", "));
    const receipt = { ...createDiagramReceipt(model), ...sessionMetadata("diagram-release", grant) };
    await atomicWriteJson(root, "receipt.release.json", receipt);
    model = await loadDiagramProject(root);
    if (!validateDiagramReceipt(model)) throw new Error("WRITTEN_RECEIPT_INVALID");
    process.stdout.write(`${JSON.stringify(receipt)}
`);
  }, grant);
}
await main().catch((error) => {
  process.stderr.write(`[diagram-project-release] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
