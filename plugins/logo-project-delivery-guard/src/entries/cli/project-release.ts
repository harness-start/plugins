#!/usr/bin/env node

import { open, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { createLogoReceipt, validateLogoModel, validateLogoReceipt } from "../../lib/contract.js";
import { assertLogoProjectRoot, loadLogoProject } from "../../lib/project.js";

function planField(plan: unknown, key: string): unknown {
  return typeof plan === "object" && plan !== null && !Array.isArray(plan)
    ? (plan as Record<string, unknown>)[key]
    : undefined;
}

const root = resolve(process.argv[2] ?? "");
const journalPath = join(root, ".logo-delivery-journal.json");
const receiptPath = join(root, "receipt.release.json");
const temporaryPath = join(root, `.receipt.release.${process.pid}.tmp`);

async function main() {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(root))) throw new Error("project root must end in a kebab-case artifact id");
  await assertLogoProjectRoot(root);
  const model = await loadLogoProject(root);
  if (planField(model.plan, "targetStage") !== "release") throw new Error("RELEASE_STAGE_NOT_REQUESTED");
  const findings = validateLogoModel(model, { stage: "release" }).filter(({ code, path }) => code !== "RECEIPT_INVALID" && !(code === "RELEASE_PATH_MISSING" && path === "receipt.release.json"));
  if (findings.length > 0) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const handle = await open(journalPath, "wx");
  await handle.writeFile(`${JSON.stringify({ schemaVersion: 1, plugin: "logo-project-delivery-guard", operation: "release", artifactId: basename(root), sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown" })}\n`);
  await handle.sync();
  await handle.close();
  let complete = false;
  try {
    const receipt = { ...createLogoReceipt(model), createdAt: new Date().toISOString(), sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown", triggerFrom: process.env.AI_EXPERTS_TRIGGER_FROM ?? "unknown" };
    await writeFile(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
    await rename(temporaryPath, receiptPath);
    if (!validateLogoReceipt(await loadLogoProject(root))) throw new Error("written receipt did not verify against current files");
    complete = true;
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  } finally {
    if (complete) await unlink(journalPath);
  }
}

main().catch((error: unknown) => { process.stderr.write(`[logo-project-release] ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });
