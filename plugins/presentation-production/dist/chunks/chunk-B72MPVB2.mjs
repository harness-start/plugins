// harness-source-hash: sha256:21d6020de3990636c899a230a14b1ce68e7808c2b3498b8eae1728dc65cec28d
import {
  isPptxProjectRoot,
  resolveWorkspaceRoot
} from "./chunk-7PVUJ726.mjs";

// plugins/presentation-production/src/lib/writer.ts
import { open, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
function assertPptxProjectRoot(value, { allowMissing = false } = {}) {
  const root = resolve(value ?? "");
  const workspaceRoot = resolveWorkspaceRoot(allowMissing ? resolve(root, "../../..") : root);
  if (!isPptxProjectRoot(root, workspaceRoot)) throw new Error("PROJECT_ROOT_OUT_OF_SCOPE");
  return root;
}
function sessionMetadata(capability, grant = {}) {
  return {
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    sessionId: grant.sessionId ?? process.env.AI_EXPERTS_SESSION_ID ?? "unknown",
    triggerFrom: grant.triggerFrom ?? process.env.AI_EXPERTS_TRIGGER_FROM ?? "unknown",
    capability
  };
}
async function atomicWriteJson(root, relativePath, payload) {
  const target = join(root, relativePath);
  const temporaryDirectory = join(root, ".tmp", "pptx-guard");
  await mkdir(temporaryDirectory, { recursive: true });
  const temporary = join(temporaryDirectory, `${basename(relativePath)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}
`, { flag: "wx" });
  await mkdir(dirname(target), { recursive: true });
  await rename(temporary, target);
}
async function withWriterJournal(root, capability, callback, grant = {}) {
  const journalPath = join(root, ".pptx-delivery-journal.json");
  const handle = await open(journalPath, "wx");
  try {
    await handle.writeFile(`${JSON.stringify({ schemaVersion: 2, plugin: "presentation-production", operation: capability, artifactId: basename(root), ...sessionMetadata(capability, grant) })}
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
  assertPptxProjectRoot,
  sessionMetadata,
  atomicWriteJson,
  withWriterJournal
};
