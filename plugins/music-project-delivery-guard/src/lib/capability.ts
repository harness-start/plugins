import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const TTL_MS = 30_000;
const CAPABILITY = /^music-(?:init|advice|reference|optimize|render|preview|stage|review|release)$/u;

export type MusicWriterGrant = {
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

const argvDigest = (argv: unknown) => createHash("sha256").update(JSON.stringify(argv)).digest("hex");
const grantPath = (root: string, capability: string) => join(root, ".tmp", "music-guard", `capability.${capability}.json`);
const errorCode = (error: unknown) => typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";

async function canonicalRoot(rawRoot: string) {
  const root = await realpath(resolve(rawRoot));
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || !/(?:^|[\\/])artifacts[\\/]music[\\/][a-z0-9]+(?:-[a-z0-9]+)*(?:$|[\\/])/u.test(`${root}/`)) throw new Error("MUSIC_PROJECT_ROOT_INVALID");
  return root;
}

function prospectiveRoot(rawRoot: string) {
  const root = resolve(rawRoot);
  if (!/(?:^|[\\/])artifacts[\\/]music[\\/][a-z0-9]+(?:-[a-z0-9]+)*$/u.test(root)) throw new Error("MUSIC_PROJECT_ROOT_INVALID");
  return root;
}

export async function issueMusicWriterCapability({ root: rawRoot, capability, argv, subjectDigest, sessionId, triggerFrom = "PreToolUse" }: {
  root: string;
  capability: string;
  argv: unknown;
  subjectDigest: string;
  sessionId: string;
  triggerFrom?: string;
}) {
  const root = capability === "music-init" ? prospectiveRoot(rawRoot) : await canonicalRoot(rawRoot);
  if (!CAPABILITY.test(capability)) throw new Error("WRITER_CAPABILITY_INVALID");
  if (!/^[a-f0-9]{64}$/u.test(subjectDigest)) throw new Error("WRITER_SUBJECT_INVALID");
  if (!sessionId || sessionId === "unknown" || sessionId === "hook") throw new Error("WRITER_SESSION_MISSING");
  const target = grantPath(root, capability);
  await mkdir(join(root, ".tmp", "music-guard"), { recursive: true });
  try {
    const existing = JSON.parse(await readFile(target, "utf8")) as Record<string, unknown>;
    if (Number(existing.expiresAt) >= Date.now()) throw new Error("WRITER_CAPABILITY_BUSY");
    await unlink(target);
  } catch (error) {
    if (error instanceof Error && error.message === "WRITER_CAPABILITY_BUSY") throw error;
    if (errorCode(error) !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    if (error instanceof SyntaxError) await unlink(target).catch(() => undefined);
  }
  const grant: MusicWriterGrant = {
    schema: "music-project-delivery-guard/writer-capability/v1",
    id: randomUUID(),
    capability,
    root,
    argvSha256: argvDigest(argv),
    subjectDigest,
    sessionId,
    triggerFrom,
    issuedAt: new Date().toISOString(),
    expiresAt: Date.now() + TTL_MS,
  };
  await writeFile(target, `${JSON.stringify(grant)}\n`, { flag: "wx", mode: 0o600 });
  await chmod(target, 0o600);
  return grant;
}

export async function consumeMusicWriterCapability({ root: rawRoot, capability, argv }: { root: string; capability: string; argv: unknown }) {
  const root = await canonicalRoot(rawRoot);
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
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString("utf8")) as unknown; } catch { throw new Error("WRITER_CAPABILITY_INVALID"); }
  if (typeof parsed !== "object" || parsed === null) throw new Error("WRITER_CAPABILITY_INVALID");
  const grant = parsed as Record<string, unknown>;
  if (grant.schema !== "music-project-delivery-guard/writer-capability/v1" || grant.capability !== capability || grant.root !== root
    || grant.argvSha256 !== argvDigest(argv) || !Number.isFinite(grant.expiresAt) || Number(grant.expiresAt) < Date.now()
    || typeof grant.subjectDigest !== "string" || !/^[a-f0-9]{64}$/u.test(grant.subjectDigest)
    || typeof grant.sessionId !== "string" || !grant.sessionId || grant.sessionId === "unknown" || grant.sessionId === "hook") throw new Error("WRITER_CAPABILITY_INVALID");
  return grant as unknown as MusicWriterGrant;
}

export function processMusicWriterArgv() {
  return [resolve(process.argv[1] ?? ""), ...process.argv.slice(2)];
}
