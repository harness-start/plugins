// harness-source-hash: sha256:aa55e37b578bd1016a6403462a3f72057de2a4fa7baa3013af84343c8e6ab3f1

// plugins/artifact-production/src/domains/music/lib/writer.ts
import { mkdir, open, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
async function atomicWriteMusicJson(root, relativePath, value) {
  const target = join(root, relativePath);
  const temporary = `${target}.${process.pid}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}
`, { flag: "wx" });
  await rename(temporary, target);
}
function musicSessionMetadata(operation, grant) {
  return { operation, sessionId: grant.sessionId, triggerFrom: grant.triggerFrom, capabilityId: grant.id, recordedAt: (/* @__PURE__ */ new Date()).toISOString() };
}
async function withMusicJournal(root, operation, grant, work) {
  const path = join(root, ".music-delivery-journal.json");
  const journal = await open(path, "wx");
  await journal.writeFile(`${JSON.stringify({ schemaVersion: 2, plugin: "music-production", operation, subjectDigest: grant.subjectDigest, sessionId: grant.sessionId })}
`);
  await journal.sync();
  await journal.close();
  let complete = false;
  try {
    const result = await work();
    complete = true;
    return result;
  } finally {
    if (complete) await unlink(path);
  }
}

export {
  atomicWriteMusicJson,
  musicSessionMetadata,
  withMusicJournal
};
