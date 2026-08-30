#!/usr/bin/env node
// harness-source-hash: sha256:aa55e37b578bd1016a6403462a3f72057de2a4fa7baa3013af84343c8e6ab3f1
import {
  consumeWriterCapability,
  processWriterArgv
} from "./chunk-UWIDTU3B.mjs";
import "./chunk-XFYUIVLB.mjs";
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
} from "./chunk-WENCY7WO.mjs";
import "./chunk-TPU7ENF4.mjs";
import "./chunk-64RZK2M5.mjs";

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
