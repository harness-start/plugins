#!/usr/bin/env node
// harness-source-hash: sha256:ce1391e033b4614b0a6cb38d556dda14dccc49c8c48ad0139447594c66cc58ca
import {
  createPosterReceipt,
  validatePosterModel,
  validatePosterReceipt
} from "../chunks/chunk-CFMAUBMU.mjs";

// plugins/poster-project-delivery-guard/src/entries/cli/project-release.ts
import { createHash } from "node:crypto";
import { open, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
var root = resolve(process.argv[2] ?? "");
var journalPath = join(root, ".poster-delivery-journal.json");
var receiptPath = join(root, "receipt.release.json");
var temporaryPath = join(root, `.receipt.release.${process.pid}.tmp`);
var sha256 = (value) => createHash("sha256").update(value).digest("hex");
async function collect(directory, files, digests, bytesMap, limits) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_REJECTED:${entry.name}`);
    if (["node_modules", ".git", ".cache", ".tmp"].includes(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) await collect(absolute, files, digests, bytesMap, limits);
    else if (entry.isFile()) {
      if (++limits.files > 2048) throw new Error("PROJECT_FILE_LIMIT_EXCEEDED");
      const bytes = await readFile(absolute);
      if (bytes.byteLength > 32 * 1024 * 1024) throw new Error(`PROJECT_FILE_SIZE_EXCEEDED:${entry.name}`);
      const filePath = relative(root, absolute).replaceAll("\\", "/");
      files[filePath] = bytes.toString("utf8");
      bytesMap[filePath] = bytes;
      digests[filePath] = sha256(bytes);
    }
  }
}
async function load() {
  const files = {};
  const digests = {};
  const bytes = {};
  await collect(root, files, digests, bytes, { files: 0 });
  const parse = (filePath) => {
    try {
      return JSON.parse(files[filePath] ?? "");
    } catch {
      return null;
    }
  };
  return { artifactId: basename(root), files, digests, bytes, plan: parse("plan.contract.json"), project: parse("poster.project.json") };
}
async function main() {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename(root))) throw new Error("project root must end in a kebab-case artifact id");
  const model = await load();
  const findings = validatePosterModel(model, { stage: "release" }).filter(({ code, path }) => code !== "RECEIPT_INVALID" && !(code === "RELEASE_PATH_MISSING" && path === "receipt.release.json"));
  if (findings.length > 0) throw new Error(findings.map(({ code, path }) => `${code}:${path}`).join(", "));
  const handle = await open(journalPath, "wx");
  await handle.writeFile(`${JSON.stringify({ schemaVersion: 1, plugin: "poster-project-delivery-guard", operation: "release", artifactId: basename(root), sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown" })}
`);
  await handle.sync();
  await handle.close();
  let complete = false;
  try {
    const receipt = {
      ...createPosterReceipt(model),
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      sessionId: process.env.AI_EXPERTS_SESSION_ID ?? "unknown",
      triggerFrom: process.env.AI_EXPERTS_TRIGGER_FROM ?? "unknown"
    };
    await writeFile(temporaryPath, `${JSON.stringify(receipt, null, 2)}
`, { flag: "wx" });
    await rename(temporaryPath, receiptPath);
    if (!validatePosterReceipt(await load())) throw new Error("written receipt did not verify against current files");
    complete = true;
    process.stdout.write(`${JSON.stringify(receipt)}
`);
  } finally {
    if (complete) await unlink(journalPath);
  }
}
main().catch((error) => {
  process.stderr.write(`[poster-project-release] ${error.message}
`);
  process.exitCode = 2;
});
