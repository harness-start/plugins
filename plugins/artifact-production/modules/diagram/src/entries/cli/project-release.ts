#!/usr/bin/env node

import { consumeWriterCapability, processWriterArgv } from "../../lib/capability.js";
import { computeDiagramSubjectDigest, createDiagramReceipt, createDiagramReleaseManifest, loadDiagramProject, validateDiagramModel, validateDiagramReceipt } from "../../lib/contract.js";
import { assertDiagramProjectRoot, atomicWriteJson, sessionMetadata, withWriterJournal } from "../../lib/writer.js";

async function main() {
  const root = assertDiagramProjectRoot(process.argv[2]); let model = await loadDiagramProject(root); const grant = await consumeWriterCapability({ root, capability: "diagram-release", argv: processWriterArgv() }); if (grant.subjectDigest !== computeDiagramSubjectDigest(model)) throw new Error("WRITER_SUBJECT_CHANGED");
  const review = JSON.parse(String(model.files?.["review.diagram.json"] ?? "{}")) as { reviewer?: { sessionId?: string } }; if (review.reviewer?.sessionId === grant.sessionId) throw new Error("SELF_RELEASE_DENIED");
  const before = validateDiagramModel(model, { stage: "review" }).filter(({ code, path }) => !["RELEASE_MANIFEST_INVALID", "RECEIPT_INVALID"].includes(code) && !["release.manifest.json", "receipt.release.json"].includes(path)); if (before.length) throw new Error(before.map(({ code, path }) => `${code}:${path}`).join(", "));
  await withWriterJournal(root, "diagram-release", async () => { await atomicWriteJson(root, "release.manifest.json", createDiagramReleaseManifest(model)); model = await loadDiagramProject(root); const manifestFindings = validateDiagramModel(model, { stage: "release" }).filter(({ code }) => !["MUTATION_JOURNAL_OPEN", "RECEIPT_INVALID"].includes(code)); if (manifestFindings.length) throw new Error(manifestFindings.map(({ code, path }) => `${code}:${path}`).join(", ")); const receipt = { ...createDiagramReceipt(model), ...sessionMetadata("diagram-release", grant) }; await atomicWriteJson(root, "receipt.release.json", receipt); model = await loadDiagramProject(root); if (!validateDiagramReceipt(model)) throw new Error("WRITTEN_RECEIPT_INVALID"); process.stdout.write(`${JSON.stringify(receipt)}\n`); }, grant);
}

main().catch((error: unknown) => { process.stderr.write(`[diagram-project-release] ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });
