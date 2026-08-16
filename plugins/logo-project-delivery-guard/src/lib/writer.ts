import { mkdir, open, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type { WriterCapabilityGrant } from "./capability.js";

export function sessionMetadata(capability: string, grant: Pick<WriterCapabilityGrant, "sessionId" | "triggerFrom">) {
  return { createdAt: new Date().toISOString(), sessionId: grant.sessionId, triggerFrom: grant.triggerFrom, capability };
}

export async function atomicWriteJson(root: string, relativePath: string, payload: unknown) {
  const target = join(root, relativePath);
  const temporaryDirectory = join(root, ".tmp", "logo-guard");
  await mkdir(temporaryDirectory, { recursive: true });
  const temporary = join(temporaryDirectory, `${basename(relativePath)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { flag: "wx" });
  await mkdir(dirname(target), { recursive: true });
  await rename(temporary, target);
}

export async function withWriterJournal<T>(root: string, capability: string, grant: WriterCapabilityGrant, callback: () => Promise<T>) {
  const journalPath = join(root, ".logo-delivery-journal.json");
  const handle = await open(journalPath, "wx");
  try {
    await handle.writeFile(`${JSON.stringify({ schemaVersion: 2, plugin: "logo-project-delivery-guard", operation: capability, artifactId: basename(root), ...sessionMetadata(capability, grant) })}\n`);
    await handle.sync();
  } finally { await handle.close(); }
  const result = await callback();
  await unlink(journalPath).catch((error: unknown) => {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    if (code !== "ENOENT") throw error;
  });
  return result;
}
