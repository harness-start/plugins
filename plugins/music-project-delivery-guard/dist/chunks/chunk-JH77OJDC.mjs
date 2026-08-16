// harness-source-hash: sha256:135cd2f55217f03f52404088fe22ea3cfc46882729cd2899c40505e6de3d9a8a

// plugins/music-project-delivery-guard/src/lib/capability.ts
import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
var TTL_MS = 3e4;
var CAPABILITY = /^music-(?:init|advice|reference|optimize|render|preview|stage|review|release)$/u;
var argvDigest = (argv) => createHash("sha256").update(JSON.stringify(argv)).digest("hex");
var grantPath = (root, capability) => join(root, ".tmp", "music-guard", `capability.${capability}.json`);
var errorCode = (error) => typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
async function canonicalRoot(rawRoot) {
  const root = await realpath(resolve(rawRoot));
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || !/(?:^|[\\/])artifacts[\\/]music[\\/][a-z0-9]+(?:-[a-z0-9]+)*(?:$|[\\/])/u.test(`${root}/`)) throw new Error("MUSIC_PROJECT_ROOT_INVALID");
  return root;
}
function prospectiveRoot(rawRoot) {
  const root = resolve(rawRoot);
  if (!/(?:^|[\\/])artifacts[\\/]music[\\/][a-z0-9]+(?:-[a-z0-9]+)*$/u.test(root)) throw new Error("MUSIC_PROJECT_ROOT_INVALID");
  return root;
}
async function issueMusicWriterCapability({ root: rawRoot, capability, argv, subjectDigest, sessionId, triggerFrom = "PreToolUse" }) {
  const root = capability === "music-init" ? prospectiveRoot(rawRoot) : await canonicalRoot(rawRoot);
  if (!CAPABILITY.test(capability)) throw new Error("WRITER_CAPABILITY_INVALID");
  if (!/^[a-f0-9]{64}$/u.test(subjectDigest)) throw new Error("WRITER_SUBJECT_INVALID");
  if (!sessionId || sessionId === "unknown" || sessionId === "hook") throw new Error("WRITER_SESSION_MISSING");
  const target = grantPath(root, capability);
  await mkdir(join(root, ".tmp", "music-guard"), { recursive: true });
  try {
    const existing = JSON.parse(await readFile(target, "utf8"));
    if (Number(existing.expiresAt) >= Date.now()) throw new Error("WRITER_CAPABILITY_BUSY");
    await unlink(target);
  } catch (error) {
    if (error instanceof Error && error.message === "WRITER_CAPABILITY_BUSY") throw error;
    if (errorCode(error) !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    if (error instanceof SyntaxError) await unlink(target).catch(() => void 0);
  }
  const grant = {
    schema: "music-project-delivery-guard/writer-capability/v1",
    id: randomUUID(),
    capability,
    root,
    argvSha256: argvDigest(argv),
    subjectDigest,
    sessionId,
    triggerFrom,
    issuedAt: (/* @__PURE__ */ new Date()).toISOString(),
    expiresAt: Date.now() + TTL_MS
  };
  await writeFile(target, `${JSON.stringify(grant)}
`, { flag: "wx", mode: 384 });
  await chmod(target, 384);
  return grant;
}
async function consumeMusicWriterCapability({ root: rawRoot, capability, argv }) {
  const root = await canonicalRoot(rawRoot);
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
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("WRITER_CAPABILITY_INVALID");
  }
  if (typeof parsed !== "object" || parsed === null) throw new Error("WRITER_CAPABILITY_INVALID");
  const grant = parsed;
  if (grant.schema !== "music-project-delivery-guard/writer-capability/v1" || grant.capability !== capability || grant.root !== root || grant.argvSha256 !== argvDigest(argv) || !Number.isFinite(grant.expiresAt) || Number(grant.expiresAt) < Date.now() || typeof grant.subjectDigest !== "string" || !/^[a-f0-9]{64}$/u.test(grant.subjectDigest) || typeof grant.sessionId !== "string" || !grant.sessionId || grant.sessionId === "unknown" || grant.sessionId === "hook") throw new Error("WRITER_CAPABILITY_INVALID");
  return grant;
}
function processMusicWriterArgv() {
  return [resolve(process.argv[1] ?? ""), ...process.argv.slice(2)];
}

export {
  issueMusicWriterCapability,
  consumeMusicWriterCapability,
  processMusicWriterArgv
};
