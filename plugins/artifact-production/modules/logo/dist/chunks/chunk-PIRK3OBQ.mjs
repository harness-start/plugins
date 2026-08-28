// harness-source-hash: sha256:ac5b59deb1154f3de9fc48d266a0dda71698e374ff81993353d80069d5766fe4

// plugins/artifact-production/modules/logo/src/lib/writer.ts
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
function sessionMetadata(capability, grant) {
  return { createdAt: (/* @__PURE__ */ new Date()).toISOString(), sessionId: grant.sessionId, triggerFrom: grant.triggerFrom, capability };
}
async function atomicWriteJson(root, relativePath, payload) {
  const target = join(root, relativePath);
  const temporaryDirectory = join(root, ".tmp", "logo-guard");
  await mkdir(temporaryDirectory, { recursive: true });
  const temporary = join(temporaryDirectory, `${basename(relativePath)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}
`, { flag: "wx" });
  await mkdir(dirname(target), { recursive: true });
  await rename(temporary, target);
}
var errorCode = (error) => typeof error === "object" && error !== null && "code" in error ? error.code : void 0;
async function acquireWriterLock(root) {
  const lockDirectory = join(root, ".tmp", "logo-guard");
  const lockPath = join(lockDirectory, "writer.lock");
  await mkdir(lockDirectory, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(`${JSON.stringify({ schemaVersion: 1, pid: process.pid, startedAt: (/* @__PURE__ */ new Date()).toISOString() })}
`);
      await handle.sync();
      return { handle, lockPath };
    } catch (error) {
      if (errorCode(error) !== "EEXIST" || attempt > 0) throw error;
      const existing = await readFile(lockPath, "utf8").then((value) => JSON.parse(value)).catch(() => ({}));
      const pid = typeof existing.pid === "number" && Number.isInteger(existing.pid) && existing.pid > 0 ? existing.pid : void 0;
      let active = pid !== void 0;
      if (pid !== void 0) {
        try {
          process.kill(pid, 0);
        } catch {
          active = false;
        }
      }
      if (active) throw new Error(`WRITER_ACTIVE:${pid}`);
      await unlink(lockPath).catch((unlinkError) => {
        if (errorCode(unlinkError) !== "ENOENT") throw unlinkError;
      });
    }
  }
  throw new Error("WRITER_LOCK_UNAVAILABLE");
}
async function writeJournal(journalPath, payload) {
  const handle = await open(journalPath, "w");
  try {
    await handle.writeFile(`${JSON.stringify(payload)}
`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function withWriterJournal(root, capability, grant, callback) {
  const journalPath = join(root, ".logo-delivery-journal.json");
  const lock = await acquireWriterLock(root);
  const base = { schemaVersion: 2, plugin: "brand-logo-production", operation: capability, artifactId: basename(root), ...sessionMetadata(capability, grant) };
  try {
    await writeJournal(journalPath, { ...base, status: "active" });
    try {
      const result = await callback();
      await unlink(journalPath).catch((error) => {
        if (errorCode(error) !== "ENOENT") throw error;
      });
      return result;
    } catch (error) {
      await writeJournal(journalPath, { ...base, status: "failed", failure: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  } finally {
    await lock.handle.close();
    await unlink(lock.lockPath).catch((error) => {
      if (errorCode(error) !== "ENOENT") throw error;
    });
  }
}

export {
  sessionMetadata,
  atomicWriteJson,
  withWriterJournal
};
