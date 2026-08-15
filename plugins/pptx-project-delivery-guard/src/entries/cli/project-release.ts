#!/usr/bin/env node

import { open, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import {
  createPptxReceipt,
  loadPptxProject,
  validatePptxModel,
  validatePptxReceipt,
} from "../../lib/contract.js";

const root = resolve(process.argv[2] ?? "");
const journalPath = join(root, ".pptx-delivery-journal.json");
const receiptPath = join(root, "receipt.release.json");
const temporaryPath = join(root, `.receipt.release.${process.pid}.tmp`);

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
    sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown",
  })}\n`);
  await handle.sync();
  await handle.close();
}

async function main() {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(root))) fail("project root must end in a kebab-case artifact id");
  const model = await loadPptxProject(root);
  const findings = validatePptxModel(model, { stage: "release" }).filter(({ code, path }) =>
    code !== "RECEIPT_INVALID" && !(code === "RELEASE_PATH_MISSING" && path === "receipt.release.json"));
  if (findings.length > 0) fail(findings.map(({ code, path }) => `${code}:${path}`).join(", "));

  await createJournal();
  let complete = false;
  try {
    const receipt = {
      ...createPptxReceipt(model, "release"),
      createdAt: new Date().toISOString(),
      sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown",
      triggerFrom: process.env.AI_EXPERTS_TRIGGER_FROM ?? "unknown",
    };
    await writeFile(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
    await rename(temporaryPath, receiptPath);
    const verified = await loadPptxProject(root);
    if (!validatePptxReceipt(verified, "release")) fail("written receipt did not verify against current files");
    complete = true;
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  } finally {
    if (complete) await unlink(journalPath);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
});
