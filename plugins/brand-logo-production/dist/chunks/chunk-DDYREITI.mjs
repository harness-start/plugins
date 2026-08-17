// harness-source-hash: sha256:73a2f211ecb1ba886fe67eb7ee4f072b280d0b2687abaa8fb22a1ee92e7816cd

// plugins/brand-logo-production/src/lib/writer.ts
import { mkdir, open, rename, unlink, writeFile } from "node:fs/promises";
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
async function withWriterJournal(root, capability, grant, callback) {
  const journalPath = join(root, ".logo-delivery-journal.json");
  const handle = await open(journalPath, "wx");
  try {
    await handle.writeFile(`${JSON.stringify({ schemaVersion: 2, plugin: "brand-logo-production", operation: capability, artifactId: basename(root), ...sessionMetadata(capability, grant) })}
`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const result = await callback();
  await unlink(journalPath).catch((error) => {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : void 0;
    if (code !== "ENOENT") throw error;
  });
  return result;
}

export {
  sessionMetadata,
  atomicWriteJson,
  withWriterJournal
};
