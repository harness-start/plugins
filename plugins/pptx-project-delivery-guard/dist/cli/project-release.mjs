#!/usr/bin/env node
// harness-source-hash: sha256:219059477b7e084f1f8b50f88b6872d4685cce2116824f4a86b5c521b3143d14
import {
  createPptxReceipt,
  loadPptxProject,
  validatePptxModel,
  validatePptxReceipt
} from "../chunks/chunk-PK7ECZQT.mjs";

// plugins/pptx-project-delivery-guard/src/entries/cli/project-release.ts
import { open, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
var root = resolve(process.argv[2] ?? "");
var journalPath = join(root, ".pptx-delivery-journal.json");
var receiptPath = join(root, "receipt.release.json");
var temporaryPath = join(root, `.receipt.release.${process.pid}.tmp`);
function fail(message) {
  throw new Error(`[pptx-project-release] ${message}`);
}
async function createJournal() {
  const handle = await open(journalPath, "wx");
  await handle.writeFile(`${JSON.stringify({
    schemaVersion: 1,
    plugin: "pptx-project-delivery-guard",
    operation: "release",
    artifactId: basename(root),
    sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown"
  })}
`);
  await handle.sync();
  await handle.close();
}
async function main() {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(root))) fail("project root must end in a kebab-case artifact id");
  const model = await loadPptxProject(root);
  const findings = validatePptxModel(model, { stage: "release" }).filter(({ code, path }) => code !== "RECEIPT_INVALID" && !(code === "RELEASE_PATH_MISSING" && path === "receipt.release.json"));
  if (findings.length > 0) fail(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  await createJournal();
  let complete = false;
  try {
    const receipt = {
      ...createPptxReceipt(model, "release"),
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown",
      triggerFrom: process.env.AI_EXPERTS_TRIGGER_FROM ?? "unknown"
    };
    await writeFile(temporaryPath, `${JSON.stringify(receipt, null, 2)}
`, { flag: "wx" });
    await rename(temporaryPath, receiptPath);
    const verified = await loadPptxProject(root);
    if (!validatePptxReceipt(verified, "release")) fail("written receipt did not verify against current files");
    complete = true;
    process.stdout.write(`${JSON.stringify(receipt)}
`);
  } finally {
    if (complete) await unlink(journalPath);
  }
}
main().catch((error) => {
  process.stderr.write(`${error.message}
`);
  process.exitCode = 2;
});
