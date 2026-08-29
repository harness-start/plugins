// harness-source-hash: sha256:06ce2d2861aa44084779ec38887836d81a8968d3d5c47812817335411bdb0436
import {
  isPptxProjectRoot,
  resolveWorkspaceRoot
} from "./chunk-4Q5RE6PT.mjs";

// plugins/artifact-production/modules/presentation/src/lib/writer.ts
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
