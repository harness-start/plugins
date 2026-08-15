#!/usr/bin/env node
import {
  assertLogoProjectRoot,
  loadLogoProject
} from "../chunks/chunk-KDHJZQG7.mjs";
import {
  createLogoReceipt,
  validateLogoModel,
  validateLogoReceipt
} from "../chunks/chunk-3G6Z6NZF.mjs";

// plugins/logo-project-delivery-guard/src/entries/cli/project-release.ts
import { open, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
var root = resolve(process.argv[2] ?? "");
var journalPath = join(root, ".logo-delivery-journal.json");
var receiptPath = join(root, "receipt.release.json");
var temporaryPath = join(root, `.receipt.release.${process.pid}.tmp`);
async function main() {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(root))) throw new Error("project root must end in a kebab-case artifact id");
  await assertLogoProjectRoot(root);
  const model = await loadLogoProject(root);
  if (model.plan?.targetStage !== "release") throw new Error("RELEASE_STAGE_NOT_REQUESTED");
  const findings = validateLogoModel(model, { stage: "release" }).filter(({ code, path }) => code !== "RECEIPT_INVALID" && !(code === "RELEASE_PATH_MISSING" && path === "receipt.release.json"));
  if (findings.length > 0) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const handle = await open(journalPath, "wx");
  await handle.writeFile(`${JSON.stringify({ schemaVersion: 1, plugin: "logo-project-delivery-guard", operation: "release", artifactId: basename(root), sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown" })}
`);
  await handle.sync();
  await handle.close();
  let complete = false;
  try {
    const receipt = { ...createLogoReceipt(model), createdAt: (/* @__PURE__ */ new Date()).toISOString(), sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown", triggerFrom: process.env.AI_EXPERTS_TRIGGER_FROM ?? "unknown" };
    await writeFile(temporaryPath, `${JSON.stringify(receipt, null, 2)}
`, { flag: "wx" });
    await rename(temporaryPath, receiptPath);
    if (!validateLogoReceipt(await loadLogoProject(root))) throw new Error("written receipt did not verify against current files");
    complete = true;
    process.stdout.write(`${JSON.stringify(receipt)}
`);
  } finally {
    if (complete) await unlink(journalPath);
  }
}
main().catch((error) => {
  process.stderr.write(`[logo-project-release] ${error.message}
`);
  process.exitCode = 2;
});
