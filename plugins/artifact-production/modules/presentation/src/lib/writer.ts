import { open, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { isPptxProjectRoot, resolveWorkspaceRoot } from "./contract.js";

export type WriterSessionGrant = { sessionId?: string; triggerFrom?: string };

export function assertPptxProjectRoot(value: string | undefined, { allowMissing = false } = {}) {
  const root = resolve(value ?? "");
  const workspaceRoot = resolveWorkspaceRoot(allowMissing ? resolve(root, "../../..") : root);
  if (!isPptxProjectRoot(root, workspaceRoot)) throw new Error("PROJECT_ROOT_OUT_OF_SCOPE");
  return root;
}

export function sessionMetadata(capability: string, grant: WriterSessionGrant = {}) {
  return {
    createdAt: new Date().toISOString(),
    sessionId: grant.sessionId ?? process.env.AI_EXPERTS_SESSION_ID ?? "unknown",
    triggerFrom: grant.triggerFrom ?? process.env.AI_EXPERTS_TRIGGER_FROM ?? "unknown",
    capability,
  };
}

export async function atomicWriteJson(root: string, relativePath: string, payload: unknown) {
  const target = join(root, relativePath);
  const temporaryDirectory = join(root, ".tmp", "pptx-guard");
  await mkdir(temporaryDirectory, { recursive: true });
  const temporary = join(temporaryDirectory, `${basename(relativePath)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { flag: "wx" });
  await mkdir(dirname(target), { recursive: true });
  await rename(temporary, target);
}

export async function withWriterJournal<T>(root: string, capability: string, callback: () => Promise<T>, grant: WriterSessionGrant = {}) {
  const journalPath = join(root, ".pptx-delivery-journal.json");
  const handle = await open(journalPath, "wx");
  try {
    await handle.writeFile(`${JSON.stringify({ schemaVersion: 2, plugin: "presentation-production", operation: capability, artifactId: basename(root), ...sessionMetadata(capability, grant) })}\n`);
    await handle.sync();
  } finally { await handle.close(); }
  const result = await callback();
  await unlink(journalPath).catch((error: unknown) => {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    if (code !== "ENOENT") throw error;
  });
  return result;
}
