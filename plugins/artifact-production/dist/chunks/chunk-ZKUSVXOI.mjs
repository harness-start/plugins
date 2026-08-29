// harness-source-hash: sha256:ccd7fb231793f87ef34f4d17127378fdb4cc6bb7c7de2d6c776759c0dd767bba
import {
  currentOwnerCliArgv
} from "./chunk-VBL6ZSQA.mjs";

// plugins/artifact-production/src/domains/music/lib/capability.ts
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
  if (!CAPABILITY.test(capability)) throw new Error("WRITER_CAPABILITY_INVALID");
  if (!/^[a-f0-9]{64}$/u.test(subjectDigest)) throw new Error("WRITER_SUBJECT_INVALID");
  if (!sessionId || sessionId === "unknown" || sessionId === "hook") throw new Error("WRITER_SESSION_MISSING");
  const prospective = capability === "music-init" ? prospectiveRoot(rawRoot) : void 0;
  if (prospective) await mkdir(prospective, { recursive: true, mode: 448 });
  const root = await canonicalRoot(prospective ?? rawRoot);
  const target = grantPath(root, capability);
  const capabilityDirectory = join(root, ".tmp", "music-guard");
  await mkdir(capabilityDirectory, { recursive: true, mode: 448 });
  await chmod(capabilityDirectory, 448);
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
    schema: "music-production/writer-capability/v1",
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
  if (grant.schema !== "music-production/writer-capability/v1" || grant.capability !== capability || grant.root !== root || grant.argvSha256 !== argvDigest(argv) || !Number.isFinite(grant.expiresAt) || Number(grant.expiresAt) < Date.now() || typeof grant.subjectDigest !== "string" || !/^[a-f0-9]{64}$/u.test(grant.subjectDigest) || typeof grant.sessionId !== "string" || !grant.sessionId || grant.sessionId === "unknown" || grant.sessionId === "hook") throw new Error("WRITER_CAPABILITY_INVALID");
  return grant;
}
function processMusicWriterArgv() {
  return currentOwnerCliArgv();
}

export {
  issueMusicWriterCapability,
  consumeMusicWriterCapability,
  processMusicWriterArgv
};
