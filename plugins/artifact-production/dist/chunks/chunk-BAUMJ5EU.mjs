// harness-source-hash: sha256:0c811d66170e751d4c95f49bfca01deb84cbe9025b35ec552ae2ab9dd9de90a7
import {
  currentOwnerCliArgv
} from "./chunk-WSR4DPVF.mjs";
import {
  assertDiagramProjectRoot
} from "./chunk-4TXNCZBT.mjs";

// plugins/artifact-production/src/domains/diagram/lib/capability.ts
import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
var TTL_MS = 3e4;
var pathOf = (root, capability) => join(root, ".tmp", "diagram-guard", `capability.${capability}.json`);
var argvDigest = (argv) => createHash("sha256").update(JSON.stringify(argv)).digest("hex");
var errorCode = (error) => typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : void 0;
async function issueWriterCapability({ root: rawRoot, capability, argv, subjectDigest, sessionId, triggerFrom }) {
  const root = assertDiagramProjectRoot(rawRoot, { allowMissing: capability === "diagram-init" });
  if (!/^diagram-(?:init|import|render|probe|review|release)$/u.test(capability)) throw new Error("WRITER_CAPABILITY_INVALID");
  if (!/^[a-f0-9]{64}$/u.test(subjectDigest)) throw new Error("WRITER_SUBJECT_INVALID");
  if (!sessionId || sessionId === "unknown") throw new Error("WRITER_SESSION_MISSING");
  const directory = join(root, ".tmp", "diagram-guard");
  const target = pathOf(root, capability);
  await mkdir(directory, { recursive: true });
  try {
    const existing = JSON.parse(await readFile(target, "utf8"));
    if (Number(existing.expiresAt) >= Date.now()) throw new Error("WRITER_CAPABILITY_BUSY");
    await unlink(target);
  } catch (error) {
    if (error instanceof Error && error.message === "WRITER_CAPABILITY_BUSY") throw error;
    if (errorCode(error) !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    if (error instanceof SyntaxError) await unlink(target).catch(() => void 0);
  }
  const grant = { schema: "diagram-production/writer-capability/v1", id: randomUUID(), capability, root, argvSha256: argvDigest(argv), subjectDigest, sessionId, triggerFrom: triggerFrom || "PreToolUse", issuedAt: (/* @__PURE__ */ new Date()).toISOString(), expiresAt: Date.now() + TTL_MS };
  await writeFile(target, `${JSON.stringify(grant)}
`, { flag: "wx", mode: 384 });
  await chmod(target, 384);
  return grant;
}
async function consumeWriterCapability({ root: rawRoot, capability, argv }) {
  const root = assertDiagramProjectRoot(rawRoot, { allowMissing: capability === "diagram-init" });
  const target = pathOf(root, capability);
  let bytes;
  try {
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("WRITER_CAPABILITY_INVALID");
    bytes = await readFile(target);
    await unlink(target);
  } catch (error) {
    if (errorCode(error) === "ENOENT") throw new Error("WRITER_CAPABILITY_MISSING");
    throw error;
  }
  let grant;
  try {
    grant = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("WRITER_CAPABILITY_INVALID");
  }
  if (typeof grant !== "object" || grant === null) throw new Error("WRITER_CAPABILITY_INVALID");
  const value = grant;
  if (value.schema !== "diagram-production/writer-capability/v1" || value.capability !== capability || value.root !== root || value.argvSha256 !== argvDigest(argv) || !Number.isFinite(value.expiresAt) || Number(value.expiresAt) < Date.now() || typeof value.subjectDigest !== "string" || !/^[a-f0-9]{64}$/u.test(value.subjectDigest) || typeof value.sessionId !== "string" || !value.sessionId || value.sessionId === "unknown") throw new Error("WRITER_CAPABILITY_INVALID");
  return value;
}
function processWriterArgv() {
  return currentOwnerCliArgv();
}

export {
  issueWriterCapability,
  consumeWriterCapability,
  processWriterArgv
};
