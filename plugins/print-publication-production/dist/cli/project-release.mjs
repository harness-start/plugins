#!/usr/bin/env node
// harness-source-hash: sha256:5cc8c8fd7ed947ae8267a0ffc491b91f22b5743b0e09c483d31097991a04f4a7
import {
  createPrintReceipt,
  validatePrintModel,
  validatePrintReceipt
} from "../chunks/chunk-O3OLEKZU.mjs";

// plugins/print-publication-production/src/entries/cli/project-release.ts
import { createHash } from "node:crypto";
import { open, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
var root = resolve(process.argv[2] ?? "");
var journalPath = join(root, ".print-delivery-journal.json");
var receiptPath = join(root, "receipt.release.json");
var temporaryPath = join(root, `.receipt.release.${process.pid}.tmp`);
var sha256 = (value) => createHash("sha256").update(value).digest("hex");
async function collect(directory, files, digests, count) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${entry.name}`);
    if (["node_modules", ".git", ".cache", ".tmp"].includes(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) await collect(absolute, files, digests, count);
    else if (entry.isFile()) {
      if (++count.value > 4096) throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
      const bytes = await readFile(absolute);
      if (bytes.byteLength > 512 * 1024 * 1024) throw new Error(`PROJECT_FILE_SIZE_EXCEEDED:${entry.name}`);
      const filePath = relative(root, absolute).replaceAll("\\", "/");
      files[filePath] = bytes.toString("utf8");
      digests[filePath] = sha256(bytes);
    }
  }
}
async function load() {
  const files = {};
  const digests = {};
  await collect(root, files, digests, { value: 0 });
  const parse = (filePath) => {
    try {
      return JSON.parse(String(files[filePath] ?? ""));
    } catch {
      return null;
    }
  };
  return { artifactId: basename(root), files, digests, plan: parse("plan.contract.json"), project: parse("print.project.json") };
}
async function main() {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(root))) throw new Error("project root must end in a kebab-case artifact id");
  const model = await load();
  const findings = validatePrintModel(model, { stage: "release" }).filter(({ code, path }) => code !== "RECEIPT_INVALID" && !(code === "RELEASE_PATH_MISSING" && path === "receipt.release.json"));
  if (findings.length > 0) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const handle = await open(journalPath, "wx");
  await handle.writeFile(`${JSON.stringify({ schemaVersion: 1, plugin: "print-publication-production", operation: "release", artifactId: basename(root), sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown" })}
`);
  await handle.sync();
  await handle.close();
  let complete = false;
  try {
    const receipt = { ...createPrintReceipt(model), createdAt: (/* @__PURE__ */ new Date()).toISOString(), sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown", triggerFrom: process.env.AI_EXPERTS_TRIGGER_FROM ?? "unknown" };
    await writeFile(temporaryPath, `${JSON.stringify(receipt, null, 2)}
`, { flag: "wx" });
    await rename(temporaryPath, receiptPath);
    if (!validatePrintReceipt(await load())) throw new Error("written receipt did not verify against current files");
    complete = true;
    process.stdout.write(`${JSON.stringify(receipt)}
`);
  } finally {
    if (complete) await unlink(journalPath);
  }
}
main().catch((error) => {
  process.stderr.write(`[print-project-release] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 2;
});
