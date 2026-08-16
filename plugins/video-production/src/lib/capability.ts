import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { assertVideoProjectRoot } from "./writer.js";

const TTL_MS = 30_000;

export type WriterCapabilityGrant = {
  schema: string;
  id: string;
  capability: string;
  root: string;
  argvSha256: string;
  sessionId: string;
  triggerFrom: string;
  issuedAt: string;
  expiresAt: number;
};

const grantPath = (root: string, capability: string) => join(root, ".tmp", "video-guard", `capability.${capability}.json`);
const argvDigest = (argv: unknown) => createHash("sha256").update(JSON.stringify(argv)).digest("hex");

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

function errorMessage(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "message" in error ? String(error.message) : undefined;
}

export async function issueWriterCapability({ root: rawRoot, capability, argv, sessionId, triggerFrom }: {
  root: string;
  capability: string;
  argv: unknown;
  sessionId: string;
  triggerFrom?: string;
}) {
  const root = assertVideoProjectRoot(rawRoot);
  if (!/^video-(?:init|admit|render|probe|review|release)$/u.test(capability)) throw new Error("WRITER_CAPABILITY_INVALID");
  if (typeof sessionId !== "string" || !sessionId || sessionId === "unknown") throw new Error("WRITER_SESSION_MISSING");
  const directory = join(root, ".tmp", "video-guard");
  const target = grantPath(root, capability);
  await mkdir(directory, { recursive: true });
  try {
    const existing: unknown = JSON.parse(await readFile(target, "utf8"));
    const expiresAt = typeof existing === "object" && existing !== null && "expiresAt" in existing ? Number(existing.expiresAt) : Number.NaN;
    if (expiresAt >= Date.now()) throw new Error("WRITER_CAPABILITY_BUSY");
    await unlink(target);
  } catch (error) {
    if (errorCode(error) !== "ENOENT" && errorMessage(error) !== "WRITER_CAPABILITY_BUSY" && !(error instanceof SyntaxError)) throw error;
    if (errorMessage(error) === "WRITER_CAPABILITY_BUSY") throw error;
    if (error instanceof SyntaxError) await unlink(target).catch(() => {});
  }
  const grant = {
    schema: "video-production/writer-capability/v1",
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

export async function consumeWriterCapability({ root: rawRoot, capability, argv }: {
  root: string;
  capability: string;
  argv: unknown;
}): Promise<WriterCapabilityGrant> {
  const root = assertVideoProjectRoot(rawRoot);
  const target = grantPath(root, capability);
  let bytes: Buffer;
  try {
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("WRITER_CAPABILITY_INVALID");
    bytes = await readFile(target);
    await unlink(target);
  } catch (error) {
    if (errorCode(error) === "ENOENT") throw new Error("WRITER_CAPABILITY_MISSING");
    throw error;
  }
  let grant: unknown;
  try { grant = JSON.parse(bytes.toString("utf8")) as unknown; } catch { throw new Error("WRITER_CAPABILITY_INVALID"); }
  if (typeof grant !== "object" || grant === null) throw new Error("WRITER_CAPABILITY_INVALID");
  const record = grant as Record<string, unknown>;
  if (record.schema !== "video-production/writer-capability/v1" || record.capability !== capability || record.root !== root || record.argvSha256 !== argvDigest(argv) || !Number.isFinite(record.expiresAt) || (record.expiresAt as number) < Date.now() || typeof record.sessionId !== "string" || !record.sessionId || record.sessionId === "unknown") throw new Error("WRITER_CAPABILITY_INVALID");
  return record as WriterCapabilityGrant;
}

export function processWriterArgv() {
  return [resolve(process.argv[1] ?? ""), ...process.argv.slice(2)];
}
