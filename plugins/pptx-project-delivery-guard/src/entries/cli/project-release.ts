#!/usr/bin/env node

import { consumeWriterCapability, processWriterArgv } from "../../lib/capability.js";
import { computePptxSubjectDigest, createPptxReceipt, createPptxReleaseManifest, loadPptxProject, validatePptxModel, validatePptxReceipt } from "../../lib/contract.js";
import { assertPptxProjectRoot, atomicWriteJson, sessionMetadata, withWriterJournal } from "../../lib/writer.js";

async function main() {
  const root = assertPptxProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "pptx-release", argv: processWriterArgv() });
  let model = await loadPptxProject(root);
  if (grant.subjectDigest !== computePptxSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  const review = JSON.parse(String(model.files?.["review.pptx.json"] ?? "{}")) as { reviewer?: { sessionId?: string } };
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
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  }, grant);
}

main().catch((error: unknown) => { process.stderr.write(`[pptx-project-release] ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });
