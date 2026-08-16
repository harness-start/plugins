import { mkdir, open, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { MusicWriterGrant } from "./capability.js";

export async function atomicWriteMusicJson(root: string, relativePath: string, value: unknown) {
  const target = join(root, relativePath);
  const temporary = `${target}.${process.pid}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  await rename(temporary, target);
}

export function musicSessionMetadata(operation: string, grant: MusicWriterGrant) {
  return { operation, sessionId: grant.sessionId, triggerFrom: grant.triggerFrom, capabilityId: grant.id, recordedAt: new Date().toISOString() };
}

export async function withMusicJournal<T>(root: string, operation: string, grant: MusicWriterGrant, work: () => Promise<T>) {
  const path = join(root, ".music-delivery-journal.json");
  const journal = await open(path, "wx");
  await journal.writeFile(`${JSON.stringify({ schemaVersion: 2, plugin: "music-project-delivery-guard", operation, subjectDigest: grant.subjectDigest, sessionId: grant.sessionId })}\n`);
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
