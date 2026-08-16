import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { assertPptxProjectRoot } from "./writer.js";

const TTL_MS = 30_000;

export type WriterCapabilityGrant = {
  schema: string;
  id: string;
  capability: string;
  root: string;
  argvSha256: string;
  subjectDigest: string;
  sessionId: string;
  triggerFrom: string;
  issuedAt: string;
  expiresAt: number;
};

const grantPath = (root: string, capability: string) => join(root, ".tmp", "pptx-guard", `capability.${capability}.json`);
const argvDigest = (argv: unknown) => createHash("sha256").update(JSON.stringify(argv)).digest("hex");
const errorCode = (error: unknown) => typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;

export async function issueWriterCapability({ root: rawRoot, capability, argv, subjectDigest, sessionId, triggerFrom }: {
  root: string; capability: string; argv: unknown; subjectDigest: string; sessionId: string; triggerFrom?: string;
}) {
  const root = assertPptxProjectRoot(rawRoot);
  if (!/^pptx-(?:render|probe|review|release)$/u.test(capability)) throw new Error("WRITER_CAPABILITY_INVALID");
  if (!/^[a-f0-9]{64}$/u.test(subjectDigest)) throw new Error("WRITER_SUBJECT_INVALID");
  if (!sessionId || sessionId === "unknown") throw new Error("WRITER_SESSION_MISSING");
  const directory = join(root, ".tmp", "pptx-guard");
  const target = grantPath(root, capability);
  await mkdir(directory, { recursive: true });
  try {
    const existing = JSON.parse(await readFile(target, "utf8")) as Record<string, unknown>;
    if (Number(existing.expiresAt) >= Date.now()) throw new Error("WRITER_CAPABILITY_BUSY");
    await unlink(target);
  } catch (error) {
    if (errorCode(error) !== "ENOENT" && !(error instanceof SyntaxError) && !(error instanceof Error && error.message === "WRITER_CAPABILITY_BUSY")) throw error;
    if (error instanceof Error && error.message === "WRITER_CAPABILITY_BUSY") throw error;
    if (error instanceof SyntaxError) await unlink(target).catch(() => {});
  }
  const grant: WriterCapabilityGrant = {
    schema: "presentation-production/writer-capability/v1",
    id: randomUUID(), capability, root, argvSha256: argvDigest(argv), subjectDigest, sessionId,
    triggerFrom: triggerFrom || "PreToolUse", issuedAt: new Date().toISOString(), expiresAt: Date.now() + TTL_MS,
  };
  await writeFile(target, `${JSON.stringify(grant)}\n`, { flag: "wx", mode: 0o600 });
  await chmod(target, 0o600);
  return grant;
}

export async function consumeWriterCapability({ root: rawRoot, capability, argv }: { root: string; capability: string; argv: unknown }) {
  const root = assertPptxProjectRoot(rawRoot);
  const target = grantPath(root, capability);
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
  const record = grant as Record<string, unknown>;
  if (record.schema !== "presentation-production/writer-capability/v1" || record.capability !== capability || record.root !== root || record.argvSha256 !== argvDigest(argv) || !Number.isFinite(record.expiresAt) || Number(record.expiresAt) < Date.now() || typeof record.subjectDigest !== "string" || !/^[a-f0-9]{64}$/u.test(record.subjectDigest) || typeof record.sessionId !== "string" || !record.sessionId || record.sessionId === "unknown") throw new Error("WRITER_CAPABILITY_INVALID");
  return record as WriterCapabilityGrant;
}

export function processWriterArgv() { return [resolve(process.argv[1] ?? ""), ...process.argv.slice(2)]; }
