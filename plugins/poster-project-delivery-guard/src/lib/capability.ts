import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { assertPosterProjectRoot } from "./writer.js";

const TTL_MS = 30_000;
export type WriterCapabilityGrant = { schema: string; id: string; capability: string; root: string; argvSha256: string; subjectDigest: string; sessionId: string; triggerFrom: string; issuedAt: string; expiresAt: number };
const pathOf = (root: string, capability: string) => join(root, ".tmp", "poster-guard", `capability.${capability}.json`);
const argvDigest = (argv: unknown) => createHash("sha256").update(JSON.stringify(argv)).digest("hex");
const errorCode = (error: unknown) => typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;

export async function issueWriterCapability({ root: rawRoot, capability, argv, subjectDigest, sessionId, triggerFrom }: { root: string; capability: string; argv: unknown; subjectDigest: string; sessionId: string; triggerFrom?: string }) {
  const root = assertPosterProjectRoot(rawRoot, { allowMissing: capability === "poster-init" });
  if (!/^poster-(?:init|render|probe|review|release)$/u.test(capability)) throw new Error("WRITER_CAPABILITY_INVALID");
  if (!/^[a-f0-9]{64}$/u.test(subjectDigest)) throw new Error("WRITER_SUBJECT_INVALID");
  if (!sessionId || sessionId === "unknown") throw new Error("WRITER_SESSION_MISSING");
  const directory = join(root, ".tmp", "poster-guard");
  const target = pathOf(root, capability);
  await mkdir(directory, { recursive: true });
  try {
    const existing = JSON.parse(await readFile(target, "utf8")) as Record<string, unknown>;
    if (Number(existing.expiresAt) >= Date.now()) throw new Error("WRITER_CAPABILITY_BUSY");
    await unlink(target);
  } catch (error) {
    if (error instanceof Error && error.message === "WRITER_CAPABILITY_BUSY") throw error;
    if (errorCode(error) !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    if (error instanceof SyntaxError) await unlink(target).catch(() => {});
  }
  const grant: WriterCapabilityGrant = {
    schema: "poster-project-delivery-guard/writer-capability/v1",
    id: randomUUID(), capability, root, argvSha256: argvDigest(argv), subjectDigest, sessionId,
    triggerFrom: triggerFrom || "PreToolUse", issuedAt: new Date().toISOString(), expiresAt: Date.now() + TTL_MS,
  };
  await writeFile(target, `${JSON.stringify(grant)}\n`, { flag: "wx", mode: 0o600 });
  await chmod(target, 0o600);
  return grant;
}

export async function consumeWriterCapability({ root: rawRoot, capability, argv }: { root: string; capability: string; argv: unknown }) {
  const root = assertPosterProjectRoot(rawRoot, { allowMissing: capability === "poster-init" });
  const target = pathOf(root, capability);
  let bytes: Buffer;
  try {
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("WRITER_CAPABILITY_INVALID");
    bytes = await readFile(target);
    await unlink(target);
  } catch (error) { if (errorCode(error) === "ENOENT") throw new Error("WRITER_CAPABILITY_MISSING"); throw error; }
  let grant: unknown;
  try { grant = JSON.parse(bytes.toString("utf8")) as unknown; } catch { throw new Error("WRITER_CAPABILITY_INVALID"); }
  if (typeof grant !== "object" || grant === null) throw new Error("WRITER_CAPABILITY_INVALID");
  const value = grant as Record<string, unknown>;
  if (value.schema !== "poster-project-delivery-guard/writer-capability/v1" || value.capability !== capability || value.root !== root || value.argvSha256 !== argvDigest(argv) || !Number.isFinite(value.expiresAt) || Number(value.expiresAt) < Date.now() || typeof value.subjectDigest !== "string" || !/^[a-f0-9]{64}$/u.test(value.subjectDigest) || typeof value.sessionId !== "string" || !value.sessionId || value.sessionId === "unknown") throw new Error("WRITER_CAPABILITY_INVALID");
  return value as WriterCapabilityGrant;
}

export function processWriterArgv() { return [resolve(process.argv[1] ?? ""), ...process.argv.slice(2)]; }
