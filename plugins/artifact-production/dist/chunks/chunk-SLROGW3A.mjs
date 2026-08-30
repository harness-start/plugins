// harness-source-hash: sha256:aa55e37b578bd1016a6403462a3f72057de2a4fa7baa3013af84343c8e6ab3f1
import {
  assertLogoProjectRoot
} from "./chunk-ZCG2IIFY.mjs";
import {
  currentOwnerCliArgv
} from "./chunk-XFYUIVLB.mjs";

// plugins/artifact-production/src/domains/logo/lib/capability.ts
import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
var TTL_MS = 3e4;
var pathOf = (root, capability) => join(root, ".tmp", "logo-guard", `capability.${capability}.json`);
var argvDigest = (argv) => createHash("sha256").update(JSON.stringify(argv)).digest("hex");
var errorCode = (error) => typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : void 0;
async function issueWriterCapability({ root: rawRoot, capability, argv, subjectDigest, sessionId, codexHome, triggerFrom }) {
  const root = await assertLogoProjectRoot(rawRoot);
  if (!/^logo-(?:advice|lock|render|preview|stage|review|release)$/u.test(capability)) throw new Error("WRITER_CAPABILITY_INVALID");
  if (!/^[a-f0-9]{64}$/u.test(subjectDigest)) throw new Error("WRITER_SUBJECT_INVALID");
  if (!sessionId || sessionId === "unknown") throw new Error("WRITER_SESSION_MISSING");
  const directory = join(root, ".tmp", "logo-guard");
  const target = pathOf(root, capability);
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
    schema: "brand-logo-production/writer-capability/v1",
    id: randomUUID(),
    capability,
    root,
    argvSha256: argvDigest(argv),
    subjectDigest,
    sessionId,
    ...codexHome ? { codexHome: resolve(codexHome) } : {},
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
  const root = await assertLogoProjectRoot(rawRoot);
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
  if (value.schema !== "brand-logo-production/writer-capability/v1" || value.capability !== capability || value.root !== root || value.argvSha256 !== argvDigest(argv) || !Number.isFinite(value.expiresAt) || Number(value.expiresAt) < Date.now() || typeof value.subjectDigest !== "string" || !/^[a-f0-9]{64}$/u.test(value.subjectDigest) || typeof value.sessionId !== "string" || !value.sessionId || value.sessionId === "unknown" || value.codexHome !== void 0 && (typeof value.codexHome !== "string" || !isAbsolute(value.codexHome))) throw new Error("WRITER_CAPABILITY_INVALID");
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
