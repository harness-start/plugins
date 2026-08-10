import { open, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { isVideoProjectRoot, resolveWorkspaceRoot } from "./project.mjs";

export function assertVideoProjectRoot(value) {
  const root = resolve(value ?? "");
  const workspaceRoot = resolveWorkspaceRoot(root);
  if (!isVideoProjectRoot(root, workspaceRoot)) throw new Error("PROJECT_ROOT_OUT_OF_SCOPE");
  return root;
}

export function sessionMetadata(capability, grant = {}) {
  return {
    createdAt: new Date().toISOString(),
    sessionId: grant.sessionId ?? process.env.AI_EXPERTS_SESSION_ID ?? "unknown",
    triggerFrom: grant.triggerFrom ?? process.env.AI_EXPERTS_TRIGGER_FROM ?? "unknown",
    capability,
  };
}

export async function atomicWriteJson(root, relativePath, payload) {
  const target = join(root, relativePath);
  const temporaryDirectory = join(root, ".tmp", "video-guard");
  await mkdir(temporaryDirectory, { recursive: true });
  const temporary = join(temporaryDirectory, `${basename(relativePath)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { flag: "wx" });
  await mkdir(dirname(target), { recursive: true });
  await rename(temporary, target);
}

export async function withWriterJournal(root, capability, callback, grant = {}) {
  const journalPath = join(root, ".video-delivery-journal.json");
  const handle = await open(journalPath, "wx");
  try {
    await handle.writeFile(`${JSON.stringify({ schemaVersion: 1, plugin: "video-project-delivery-guard", operation: capability, artifactId: basename(root), ...sessionMetadata(capability, grant) })}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const result = await callback();
  await unlink(journalPath).catch((error) => { if (error?.code !== "ENOENT") throw error; });
  return result;
}
