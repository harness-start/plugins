// harness-source-hash: sha256:2dacaf9b88d10a099c4330aa41f0c0f58ac46b041bf30fe0aa69a15b6c96e973
import {
  assertTrainingProjectRoot
} from "./chunk-3Y67TSGG.mjs";

// plugins/artifact-production/modules/training/src/lib/capability.ts
import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
var TTL_MS = 3e4;
var CAPABILITY_SCHEMA = "training-program-design/writer-capability/v1";
var grantPath = (root, capability) => join(root, ".tmp", "training-guard", `capability.${capability}.json`);
var argvDigest = (argv) => createHash("sha256").update(JSON.stringify(argv)).digest("hex");
var errorCode = (error) => typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : void 0;
async function issueWriterCapability({ root: rawRoot, capability, argv, subjectDigest, sessionId, triggerFrom }) {
  const root = assertTrainingProjectRoot(rawRoot);
  if (!/^training-(?:render|review|release)$/u.test(capability)) throw new Error("WRITER_CAPABILITY_INVALID");
  if (!/^[a-f0-9]{64}$/u.test(subjectDigest)) throw new Error("WRITER_SUBJECT_INVALID");
  if (!sessionId || sessionId === "unknown") throw new Error("WRITER_SESSION_MISSING");
  const directory = join(root, ".tmp", "training-guard");
  const target = grantPath(root, capability);
  await mkdir(directory, { recursive: true });
  try {
    const existing = JSON.parse(await readFile(target, "utf8"));
    if (Number(existing.expiresAt) >= Date.now()) throw new Error("WRITER_CAPABILITY_BUSY");
    await unlink(target);
  } catch (error) {
    if (error instanceof Error && error.message === "WRITER_CAPABILITY_BUSY") throw error;
    if (errorCode(error) !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    if (error instanceof SyntaxError) await unlink(target).catch(() => {
    });
  }
  const grant = {
    schema: CAPABILITY_SCHEMA,
    id: randomUUID(),
    capability,
    root,
    argvSha256: argvDigest(argv),
    subjectDigest,
    sessionId,
    triggerFrom: triggerFrom || "PreToolUse",
    issuedAt: (/* @__PURE__ */ new Date()).toISOString(),
    expiresAt: Date.now() + TTL_MS
  };
  await writeFile(target, `${JSON.stringify(grant)}
`, { flag: "wx", mode: 384 });
  await chmod(target, 384);
  return grant;
}
async function consumeWriterCapability({ root: rawRoot, capability, argv }) {
  const root = assertTrainingProjectRoot(rawRoot);
  const target = grantPath(root, capability);
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
  const record = grant;
  if (record.schema !== CAPABILITY_SCHEMA || record.capability !== capability || record.root !== root || record.argvSha256 !== argvDigest(argv) || !Number.isFinite(record.expiresAt) || Number(record.expiresAt) < Date.now() || typeof record.subjectDigest !== "string" || !/^[a-f0-9]{64}$/u.test(record.subjectDigest) || typeof record.sessionId !== "string" || !record.sessionId || record.sessionId === "unknown") throw new Error("WRITER_CAPABILITY_INVALID");
  return record;
}
function processWriterArgv() {
  return [resolve(process.argv[1] ?? ""), ...process.argv.slice(2)];
}

export {
  issueWriterCapability,
  consumeWriterCapability,
  processWriterArgv
};
