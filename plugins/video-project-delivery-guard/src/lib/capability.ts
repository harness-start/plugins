import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { assertVideoProjectRoot } from "./writer.js";

const TTL_MS = 30_000;

const grantPath = (root, capability) => join(root, ".tmp", "video-guard", `capability.${capability}.json`);
const argvDigest = (argv) => createHash("sha256").update(JSON.stringify(argv)).digest("hex");

export async function issueWriterCapability({ root: rawRoot, capability, argv, sessionId, triggerFrom }) {
  const root = assertVideoProjectRoot(rawRoot);
  if (!/^video-(?:render|probe|review|release)$/u.test(capability)) throw new Error("WRITER_CAPABILITY_INVALID");
  if (typeof sessionId !== "string" || !sessionId || sessionId === "unknown") throw new Error("WRITER_SESSION_MISSING");
  const directory = join(root, ".tmp", "video-guard");
  const target = grantPath(root, capability);
  await mkdir(directory, { recursive: true });
  try {
    const existing = JSON.parse(await readFile(target, "utf8"));
    if (Number(existing?.expiresAt) >= Date.now()) throw new Error("WRITER_CAPABILITY_BUSY");
    await unlink(target);
  } catch (error) {
    if (error?.code !== "ENOENT" && error?.message !== "WRITER_CAPABILITY_BUSY" && !(error instanceof SyntaxError)) throw error;
    if (error?.message === "WRITER_CAPABILITY_BUSY") throw error;
    if (error instanceof SyntaxError) await unlink(target).catch(() => {});
  }
  const grant = {
    schema: "video-project-delivery-guard/writer-capability/v1",
    id: randomUUID(),
    capability,
    root,
    argvSha256: argvDigest(argv),
    sessionId,
    triggerFrom: triggerFrom || "PreToolUse",
    issuedAt: new Date().toISOString(),
    expiresAt: Date.now() + TTL_MS,
  };
  await writeFile(target, `${JSON.stringify(grant)}\n`, { flag: "wx", mode: 0o600 });
  await chmod(target, 0o600);
  return grant;
}

export async function consumeWriterCapability({ root: rawRoot, capability, argv }) {
  const root = assertVideoProjectRoot(rawRoot);
  const target = grantPath(root, capability);
  let bytes;
  try {
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("WRITER_CAPABILITY_INVALID");
    bytes = await readFile(target);
    await unlink(target);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error("WRITER_CAPABILITY_MISSING");
    throw error;
  }
  let grant;
  try { grant = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("WRITER_CAPABILITY_INVALID"); }
  if (grant?.schema !== "video-project-delivery-guard/writer-capability/v1" || grant?.capability !== capability || grant?.root !== root || grant?.argvSha256 !== argvDigest(argv) || !Number.isFinite(grant?.expiresAt) || grant.expiresAt < Date.now() || typeof grant?.sessionId !== "string" || !grant.sessionId || grant.sessionId === "unknown") throw new Error("WRITER_CAPABILITY_INVALID");
  return grant;
}

export function processWriterArgv() {
  return [resolve(process.argv[1]), ...process.argv.slice(2)];
}
