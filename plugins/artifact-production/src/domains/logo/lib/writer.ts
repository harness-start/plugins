import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
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

const errorCode = (error: unknown) => typeof error === "object" && error !== null && "code" in error ? error.code : undefined;

async function acquireWriterLock(root: string) {
  const lockDirectory = join(root, ".tmp", "logo-guard");
  const lockPath = join(lockDirectory, "writer.lock");
  await mkdir(lockDirectory, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(`${JSON.stringify({ schemaVersion: 1, pid: process.pid, startedAt: new Date().toISOString() })}\n`);
      await handle.sync();
      return { handle, lockPath };
    } catch (error: unknown) {
      if (errorCode(error) !== "EEXIST" || attempt > 0) throw error;
      const existing: { pid?: unknown } = await readFile(lockPath, "utf8")
        .then((value) => JSON.parse(value) as { pid?: unknown })
        .catch(() => ({}));
      const pid = typeof existing.pid === "number" && Number.isInteger(existing.pid) && existing.pid > 0 ? existing.pid : undefined;
      let active = pid !== undefined;
      if (pid !== undefined) {
        try { process.kill(pid, 0); } catch { active = false; }
      }
      if (active) throw new Error(`WRITER_ACTIVE:${pid}`);
      await unlink(lockPath).catch((unlinkError: unknown) => { if (errorCode(unlinkError) !== "ENOENT") throw unlinkError; });
    }
  }
  throw new Error("WRITER_LOCK_UNAVAILABLE");
}

async function writeJournal(journalPath: string, payload: unknown) {
  const handle = await open(journalPath, "w");
  try {
    await handle.writeFile(`${JSON.stringify(payload)}\n`);
    await handle.sync();
  } finally { await handle.close(); }
}

export async function withWriterJournal<T>(root: string, capability: string, grant: WriterCapabilityGrant, callback: () => Promise<T>) {
  const journalPath = join(root, ".logo-delivery-journal.json");
  const lock = await acquireWriterLock(root);
  const base = { schemaVersion: 2, plugin: "brand-logo-production", operation: capability, artifactId: basename(root), ...sessionMetadata(capability, grant) };
  try {
    await writeJournal(journalPath, { ...base, status: "active" });
    try {
      const result = await callback();
      await unlink(journalPath).catch((error: unknown) => { if (errorCode(error) !== "ENOENT") throw error; });
      return result;
    } catch (error: unknown) {
      await writeJournal(journalPath, { ...base, status: "failed", failure: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  } finally {
    await lock.handle.close();
    await unlink(lock.lockPath).catch((error: unknown) => { if (errorCode(error) !== "ENOENT") throw error; });
  }
}
