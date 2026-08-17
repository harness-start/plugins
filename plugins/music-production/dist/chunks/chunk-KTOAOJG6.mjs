// harness-source-hash: sha256:ea0ad845b5b54a4eb87506c1850434e5f55bb4ce422aa89f81138b7732fb56f7

// plugins/music-production/src/lib/writer.ts
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
