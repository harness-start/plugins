#!/usr/bin/env node
// harness-source-hash: sha256:9e7635a32a1d6008cea4769c84263cdc68e521313dc0612d4b1fb7dcaaf797a7
import {
  consumeWriterCapability,
  processWriterArgv
} from "../chunks/chunk-YGIZNSHD.mjs";
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
} from "../chunks/chunk-UBLTSLB6.mjs";

// plugins/artifact-production/modules/diagram/src/entries/cli/project-release.ts
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
main().catch((error) => {
  process.stderr.write(`[diagram-project-release] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
