#!/usr/bin/env node

import { createVideoReceipt, createVideoReleaseManifest, validateVideoModel, validateVideoReceipt } from "../lib/contract.mjs";
import { consumeWriterCapability, processWriterArgv } from "../lib/capability.mjs";
import { loadVideoProject } from "../lib/project.mjs";
import { assertVideoProjectRoot, atomicWriteJson, sessionMetadata, withWriterJournal } from "../lib/writer.mjs";

function beforeManifestFindings(model) {
  const allowed = new Set(["RELEASE_MANIFEST_INVALID", "RECEIPT_INVALID", "RELEASE_PATH_MISSING", "MUTATION_JOURNAL_OPEN"]);
  return validateVideoModel(model, { stage: "release" }).filter(({ code, path }) => !allowed.has(code) || (code === "RELEASE_PATH_MISSING" && !["release.manifest.json", "receipt.release.json"].includes(path)));
}

async function main() {
  const root = assertVideoProjectRoot(process.argv[2]);
  const grant = await consumeWriterCapability({ root, capability: "video-release", argv: processWriterArgv() });
  let model = await loadVideoProject(root);
  const findings = beforeManifestFindings(model);
  if (findings.length > 0) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  await withWriterJournal(root, "video-release", async () => {
    await atomicWriteJson(root, "release.manifest.json", createVideoReleaseManifest(model));
    model = await loadVideoProject(root);
    const manifestFindings = validateVideoModel(model, { stage: "release" }).filter(({ code, path }) => !["MUTATION_JOURNAL_OPEN", "RECEIPT_INVALID"].includes(code) && !(code === "RELEASE_PATH_MISSING" && path === "receipt.release.json"));
    if (manifestFindings.length > 0) throw new Error(manifestFindings.map(({ code, path }) => `${code}:${path}`).join(", "));
    const receipt = { ...createVideoReceipt(model), ...sessionMetadata("video-release", grant) };
    await atomicWriteJson(root, "receipt.release.json", receipt);
    model = await loadVideoProject(root);
    if (!validateVideoReceipt(model)) throw new Error("WRITTEN_RECEIPT_INVALID");
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  }, grant);
}

main().catch((error) => { process.stderr.write(`[video-project-release] ${error.message}\n`); process.exitCode = 2; });
